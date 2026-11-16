import { useFrame, useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { NEVER, type GameRecord, type StoneLife } from '../domain/game.ts';
import { playStone } from '../replay/sound.ts';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { timelineOf, useStore } from '../state/store.ts';
import {
  BOARD_TOP,
  BOWL,
  BOWL_HEIGHT,
  LID,
  LID_FLOOR,
  STONE_DIAMETER_BLACK,
  STONE_DIAMETER_WHITE,
  STONE_THICKNESS,
  pointToWorld,
} from './dimensions.ts';
import { useStoneAssets } from './materials.ts';
import { hashString, mulberry32 } from './random.ts';
import { ATLAS_COLUMNS, ATLAS_ROWS, numberAtlas } from './textures.ts';

type Controls = { stop: () => void };

/** Où se trouve une pierre à un instant donné de la partie. */
const HIDDEN = 0; // encore dans le bol
const ON_BOARD = 1;
const IN_LID = 2; // prisonnière, dans le couvercle de l'adversaire
type Phase = typeof HIDDEN | typeof ON_BOARD | typeof IN_LID;

interface Pose {
  x: number;
  y: number;
  z: number;
  /** Inclinaisons (rad) autour de x et z ; la rotation propre autour de y est fixe par pierre. */
  rx: number;
  rz: number;
  /** Échelle : 0 = invisible. */
  s: number;
}

interface Rest {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}

const phaseAt = (stone: StoneLife, n: number): Phase =>
  n < stone.placedAt ? HIDDEN : n < stone.capturedAt ? ON_BOARD : IN_LID;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Bézier quadratique. */
const quad = (a: number, b: number, c: number, t: number): number =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/** Durée (s) du geste de pose quand on avance d'un coup à la main. */
const PLACE_DURATION = 0.62;
const CAPTURE_DURATION = 0.55;
const UNDO_DURATION = 0.3;
/** Part du geste consacrée au trajet jusqu'au-dessus de l'intersection ; le reste est la frappe. */
const TRAVEL = 0.74;

const NUMBER_VERTEX = /* glsl */ `
  attribute float cell;
  attribute vec3 tint;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    float col = mod(cell, ${ATLAS_COLUMNS}.0);
    float row = floor(cell / ${ATLAS_COLUMNS}.0);
    vUv = (vec2(col, ${ATLAS_ROWS}.0 - 1.0 - row) + uv) / vec2(${ATLAS_COLUMNS}.0, ${ATLAS_ROWS}.0);
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const NUMBER_FRAGMENT = /* glsl */ `
  uniform sampler2D atlas;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    float a = texture2D(atlas, vUv).a;
    if (a < 0.03) discard;
    gl_FragColor = vec4(vTint, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Les pierres d'une partie. Chaque pierre physique (une par coup, plus le handicap) est une
 * instance ; son état cible se déduit du numéro de coup courant, et Motion anime le passage
 * d'un état à l'autre : pose depuis le bol, capture vers le couvercle, reprise.
 */
export function Stones({ game }: { game: GameRecord }) {
  const timeline = useMemo(() => timelineOf(game), [game]);
  const { stones, counts } = timeline;
  const assets = useStoneAssets();
  const invalidate = useThree((s) => s.invalidate);
  const showNumbers = useStore((s) => s.showNumbers);

  const blackRef = useRef<THREE.InstancedMesh>(null);
  const whiteRef = useRef<THREE.InstancedMesh>(null);
  const numbersRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const dirty = useRef(true);

  // Poses de repos, déterministes pour une partie donnée.
  const rest = useMemo(() => {
    const rnd = mulberry32(hashString(game.id));
    const spin: number[] = [];
    const board: Rest[] = [];
    const lid: Rest[] = [];
    // Rang de chaque prisonnier dans le couvercle de son ravisseur.
    const rank = { B: 0, W: 0 };
    const order = stones
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.capturedAt !== NEVER)
      .sort((a, b) => a.s.capturedAt - b.s.capturedAt || a.i - b.i);
    const lidRank = new Map<number, number>();
    for (const { s, i } of order) lidRank.set(i, rank[s.color]++);

    stones.forEach((s, i) => {
      spin.push(rnd() * Math.PI * 2);
      const [x, z] = pointToWorld(s.point);
      // Une main ne pose jamais une pierre exactement au centre.
      board.push({
        x: x + (rnd() - 0.5) * 0.035,
        y: BOARD_TOP,
        z: z + (rnd() - 0.5) * 0.11,
        rx: 0,
        rz: 0,
      });
      // Les pierres noires capturées vont dans le couvercle de Blanc, et inversement.
      const holder = s.color === 'B' ? LID.W : LID.B;
      const k = lidRank.get(i) ?? 0;
      const layer = Math.floor(k / 11);
      const j = k % 11;
      const r = 1.28 * Math.sqrt(j);
      const a = j * 2.39996 + layer * 0.9;
      lid.push({
        x: holder.x + Math.cos(a) * r,
        y: LID_FLOOR + 0.05 + layer * 0.6,
        z: holder.z + Math.sin(a) * r,
        rx: (rnd() - 0.5) * (layer === 0 ? 0.12 : 0.5),
        rz: (rnd() - 0.5) * (layer === 0 ? 0.12 : 0.5),
      });
    });
    return { spin, board, lid };
  }, [game.id, stones]);

  const numberMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { atlas: { value: numberAtlas() } },
        vertexShader: NUMBER_VERTEX,
        fragmentShader: NUMBER_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  const numberGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.5, 1.5);
    g.rotateX(-Math.PI / 2);
    const cell = new Float32Array(stones.length);
    const tint = new Float32Array(stones.length * 3);
    stones.forEach((s, i) => {
      cell[i] = Math.max(0, s.placedAt - 1);
      const v = s.color === 'B' ? 0.93 : 0.07;
      tint.set([v, v * 0.98, v * 0.94], i * 3);
    });
    g.setAttribute('cell', new THREE.InstancedBufferAttribute(cell, 1));
    g.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
    return g;
  }, [stones]);

  // État animé, hors React : une pose et une animation en cours par pierre.
  const live = useRef<{ pose: Pose[]; phase: Phase[]; running: (Controls | undefined)[] }>({
    pose: [],
    phase: [],
    running: [],
  });

  useEffect(() => {
    const L = live.current;
    L.pose = stones.map((s) => ({
      x: BOWL[s.color].x,
      y: BOWL_HEIGHT,
      z: BOWL[s.color].z,
      rx: 0,
      rz: 0,
      s: 0,
    }));
    L.phase = stones.map(() => HIDDEN);
    L.running = [];
    let markerRun: Controls | undefined;
    let shown = -1;

    const touch = (): void => {
      dirty.current = true;
      invalidate();
    };
    const stop = (i: number): void => {
      L.running[i]?.stop();
      L.running[i] = undefined;
    };
    const settle = (i: number, to: Rest, scale: number): void => {
      const p = L.pose[i]!;
      p.x = to.x;
      p.y = to.y;
      p.z = to.z;
      p.rx = to.rx;
      p.rz = to.rz;
      p.s = scale;
    };
    const targetOf = (i: number, phase: Phase): Rest => {
      if (phase === ON_BOARD) return rest.board[i]!;
      if (phase === IN_LID) return rest.lid[i]!;
      const b = BOWL[stones[i]!.color];
      return { x: b.x, y: BOWL_HEIGHT - 1.5, z: b.z, rx: 0, rz: 0 };
    };

    /** La pierre oscille un instant sur sa face bombée après la frappe. */
    const wobble = (i: number): void => {
      const dir = Math.random() * Math.PI * 2;
      const p = L.pose[i]!;
      L.running[i] = animate(0.085, 0, {
        type: 'spring',
        stiffness: 620,
        damping: 7.5,
        mass: 0.5,
        onUpdate: (v) => {
          p.rx = v * Math.cos(dir);
          p.rz = v * Math.sin(dir);
          touch();
        },
        onComplete: () => {
          L.running[i] = undefined;
        },
      });
    };

    const setMarker = (n: number, delay: number): void => {
      const marker = markerRef.current;
      if (!marker) return;
      markerRun?.stop();
      const i = n > 0 ? timeline.stoneOfMove[n]! : -1;
      if (i < 0 || phaseAt(stones[i]!, n) !== ON_BOARD) {
        marker.visible = false;
        touch();
        return;
      }
      const at = rest.board[i]!;
      const show = (): void => {
        marker.position.set(at.x, BOARD_TOP + STONE_THICKNESS + 0.004, at.z);
        marker.visible = true;
      };
      if (delay === 0) {
        show();
        marker.scale.setScalar(1);
        touch();
        return;
      }
      marker.visible = false;
      markerRun = animate(0, 1, {
        delay,
        type: 'spring',
        stiffness: 420,
        damping: 16,
        onUpdate: (v) => {
          show();
          marker.scale.setScalar(Math.max(0.001, v));
          touch();
        },
      });
    };

    /** Geste de pose : la pierre sort du bol, vient au-dessus de l'intersection, puis frappe. */
    const place = (i: number, duration: number, sound: boolean): void => {
      stop(i);
      const stone = stones[i]!;
      const p = L.pose[i]!;
      const to = rest.board[i]!;
      const from = targetOf(i, HIDDEN);
      const side = stone.color === 'B' ? 1 : -1;
      const hover = { x: to.x, y: BOARD_TOP + 2.4, z: to.z + side * 0.75 };
      const apex = {
        x: lerp(from.x, hover.x, 0.5),
        y: BOARD_TOP + 14,
        z: lerp(from.z, hover.z, 0.5),
      };
      L.phase[i] = ON_BOARD;
      L.running[i] = animate(0, 1, {
        duration,
        ease: 'linear',
        onUpdate: (t) => {
          const k = Math.min(t / TRAVEL, 1);
          const a = 1 - (1 - k) ** 3;
          p.x = quad(from.x, apex.x, hover.x, a);
          p.y = quad(from.y, apex.y, hover.y, a);
          p.z = quad(from.z, apex.z, hover.z, a);
          if (t > TRAVEL) {
            const d = (t - TRAVEL) / (1 - TRAVEL);
            const e = d * d;
            p.x = lerp(hover.x, to.x, e);
            p.y = lerp(hover.y, to.y, e);
            p.z = lerp(hover.z, to.z, e);
          }
          p.s = Math.min(1, 0.3 + (t / 0.14) * 0.7);
          // Tenue entre l'index et le majeur, la pierre arrive inclinée vers le joueur.
          p.rx = side * 0.6 * (1 - Math.min(1, t / 0.96));
          p.rz = 0;
          touch();
        },
        onComplete: () => {
          settle(i, to, 1);
          touch();
          if (sound) playStone('place');
          wobble(i);
        },
      });
    };

    /** Trajet en cloche entre deux poses de repos (capture, ou annulation d'un coup). */
    const fly = (
      i: number,
      phase: Phase,
      opts: { duration: number; delay: number; lift: number; endScale: number; sound?: boolean },
    ): void => {
      stop(i);
      const p = L.pose[i]!;
      const from = { ...p };
      const to = targetOf(i, phase);
      const apexY = Math.max(from.y, to.y) + opts.lift;
      const tumble = (Math.random() - 0.5) * 1.6;
      L.phase[i] = phase;
      L.running[i] = animate(0, 1, {
        duration: opts.duration,
        delay: opts.delay,
        ease: [0.45, 0, 0.3, 1],
        onUpdate: (t) => {
          p.x = lerp(from.x, to.x, t);
          p.z = lerp(from.z, to.z, t);
          p.y = quad(from.y, apexY, to.y, t);
          p.rx = lerp(from.rx, to.rx, t) + Math.sin(t * Math.PI) * tumble;
          p.rz = lerp(from.rz, to.rz, t);
          p.s = lerp(from.s === 0 ? 1 : from.s, opts.endScale, t ** 3);
          touch();
        },
        onComplete: () => {
          L.running[i] = undefined;
          settle(i, to, opts.endScale);
          touch();
          if (opts.sound) playStone('capture');
        },
      });
    };

    /** Saut direct à une position quelconque : les pierres apparaissent ou s'effacent sur place. */
    const jump = (n: number, instant: boolean): void => {
      stones.forEach((stone, i) => {
        const phase = phaseAt(stone, n);
        const was = L.phase[i]!;
        const busy = L.running[i] !== undefined;
        if (phase === was && !busy) return;
        stop(i);
        L.phase[i] = phase;
        const to = targetOf(i, phase);
        const p = L.pose[i]!;
        // Même état, mais un geste était en cours : on le termine sur-le-champ.
        if (phase === was || instant) return settle(i, to, phase === HIDDEN ? 0 : 1);
        if (phase === HIDDEN) {
          L.running[i] = animate(p.s, 0, {
            duration: 0.16,
            ease: 'easeIn',
            onUpdate: (v) => {
              p.s = v;
              touch();
            },
            onComplete: () => {
              L.running[i] = undefined;
              settle(i, to, 0);
            },
          });
          return;
        }
        settle(i, to, was === HIDDEN ? 0 : 0.6);
        L.running[i] = animate(p.s, 1, {
          type: 'spring',
          stiffness: 380,
          damping: 24,
          delay: was === HIDDEN ? Math.random() * 0.12 : 0,
          onUpdate: (v) => {
            p.s = Math.max(0, v);
            touch();
          },
          onComplete: () => {
            L.running[i] = undefined;
          },
        });
      });
      setMarker(n, 0);
      touch();
    };

    const apply = (n: number): void => {
      const previous = shown;
      shown = n;
      const { playing, speed, sound } = useStore.getState();
      const reduced = prefersReducedMotion();
      if (previous === -1 || reduced || Math.abs(n - previous) !== 1) {
        jump(n, reduced);
        return;
      }
      if (n === previous + 1) {
        // Un coup en avant : le geste doit tenir dans l'intervalle de lecture.
        const duration = playing ? Math.min(PLACE_DURATION, (1 / speed) * 0.85) : PLACE_DURATION;
        const i = timeline.stoneOfMove[n]!;
        if (i >= 0) place(i, duration, sound);
        (timeline.capturesAt[n] ?? []).forEach((c, k) =>
          fly(c, IN_LID, {
            duration: Math.min(CAPTURE_DURATION, duration * 1.4),
            delay: duration + 0.1 + k * Math.min(0.06, duration * 0.12),
            lift: 9,
            endScale: 1,
            sound: sound && k < 4,
          }),
        );
        setMarker(n, i >= 0 ? duration : 0);
      } else {
        // Un coup en arrière : la pierre retourne au bol, les prisonniers reviennent sur le goban.
        const i = timeline.stoneOfMove[previous]!;
        if (i >= 0) fly(i, HIDDEN, { duration: UNDO_DURATION, delay: 0, lift: 7, endScale: 0 });
        (timeline.capturesAt[previous] ?? []).forEach((c) =>
          fly(c, ON_BOARD, { duration: UNDO_DURATION + 0.05, delay: 0.05, lift: 6, endScale: 1 }),
        );
        setMarker(n, 0);
      }
    };

    apply(useStore.getState().move);
    const unsubscribe = useStore.subscribe((s) => {
      if (s.move !== shown) apply(s.move);
    });
    return () => {
      unsubscribe();
      markerRun?.stop();
      L.running.forEach((c) => c?.stop());
    };
  }, [game.id, invalidate, rest, stones, timeline]);

  useEffect(() => {
    dirty.current = true;
    invalidate();
  }, [showNumbers, invalidate]);

  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(0, 0, 0, 'YXZ'),
      v: new THREE.Vector3(),
      s: new THREE.Vector3(),
      flat: new THREE.Quaternion(),
    }),
    [],
  );

  const write = (): void => {
    const black = blackRef.current;
    const white = whiteRef.current;
    const numbers = numbersRef.current;
    const L = live.current;
    if (!black || !white || L.pose.length !== stones.length) return;
    const { m, q, e, v, s, flat } = scratch;
    stones.forEach((stone, i) => {
      const p = L.pose[i]!;
      const d = (stone.color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE) * p.s;
      e.set(p.rx, rest.spin[i]!, p.rz);
      q.setFromEuler(e);
      m.compose(v.set(p.x, p.y, p.z), q, s.set(d, d, d));
      (stone.color === 'B' ? black : white).setMatrixAt(stone.slot, m);
      if (numbers) {
        const visible = showNumbers && stone.placedAt > 0 && L.phase[i] === ON_BOARD;
        const k = visible ? p.s : 0;
        m.compose(v.set(p.x, p.y + STONE_THICKNESS + 0.012, p.z), flat, s.set(k, k, k));
        numbers.setMatrixAt(i, m);
      }
    });
    black.instanceMatrix.needsUpdate = true;
    white.instanceMatrix.needsUpdate = true;
    if (numbers) numbers.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    // Avant la première image : toutes les instances à l'échelle nulle.
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const mesh of [blackRef.current, whiteRef.current, numbersRef.current]) {
      if (!mesh) continue;
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, zero);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
    }
  }, [game.id]);

  useFrame(() => {
    if (!dirty.current) return;
    dirty.current = false;
    write();
  });

  return (
    <group>
      <instancedMesh
        ref={blackRef}
        args={[assets.geometry, assets.black, Math.max(1, counts.B)]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={whiteRef}
        args={[assets.geometry, assets.white, Math.max(1, counts.W)]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={numbersRef}
        args={[numberGeometry, numberMaterial, Math.max(1, stones.length)]}
        visible={showNumbers}
        renderOrder={2}
      />
      {/* Repère du dernier coup : un point de vermillon, comme l'encre des sceaux. */}
      <mesh ref={markerRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1}>
        <circleGeometry args={[0.27, 40]} />
        <meshBasicMaterial color="#d2452c" toneMapped={false} visible={!showNumbers} />
      </mesh>
    </group>
  );
}
