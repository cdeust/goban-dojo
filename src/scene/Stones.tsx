import { useFrame, useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { NEVER, type StoneLife, type Timeline } from '../domain/game.ts';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { playStone } from '../replay/sound.ts';
import { displayOf, useStore } from '../state/store.ts';
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

/**
 * Capacité des maillages instanciés, par couleur. La plus longue partie du corpus compte
 * 342 coups, soit 171 pierres par couleur ; une exploration en ajoute au plus 80.
 */
export const STONE_CAPACITY = 260;

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

/** Vrai si `a` et `b` décrivent les mêmes pierres sur leurs `n` premières entrées. */
function samePrefix(a: Timeline, b: Timeline, n: number): boolean {
  for (let i = 0; i < n; i++) {
    const x = a.stones[i];
    const y = b.stones[i];
    if (!x || !y || x.point !== y.point || x.color !== y.color || x.placedAt !== y.placedAt) {
      return false;
    }
  }
  return true;
}

/**
 * Les pierres de la position affichée. Chaque pierre physique (une par coup, plus le handicap)
 * est une instance ; son état cible se déduit du numéro de coup, et Motion anime le passage d'un
 * état à l'autre : pose depuis le bol, capture vers le couvercle, reprise.
 *
 * La position peut s'allonger en cours de route (mode « explorer ») : les pierres déjà posées
 * gardent leur place, les nouvelles s'y ajoutent.
 *
 * @param seed identifiant de la partie : fixe les petites irrégularités de pose.
 */
export function Stones({ seed }: { seed: string }) {
  const assets = useStoneAssets();
  const invalidate = useThree((s) => s.invalidate);
  const showNumbers = useStore((s) => s.showNumbers);

  const blackRef = useRef<THREE.InstancedMesh>(null);
  const whiteRef = useRef<THREE.InstancedMesh>(null);
  const numbersRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const dirty = useRef(true);
  const showNumbersRef = useRef(showNumbers);

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
    g.setAttribute(
      'cell',
      new THREE.InstancedBufferAttribute(new Float32Array(STONE_CAPACITY * 2), 1),
    );
    g.setAttribute(
      'tint',
      new THREE.InstancedBufferAttribute(new Float32Array(STONE_CAPACITY * 6), 3),
    );
    return g;
  }, []);

  // État animé, hors React.
  const live = useRef<{
    timeline: Timeline | null;
    pose: Pose[];
    phase: Phase[];
    running: (Controls | undefined)[];
    spin: number[];
    board: Rest[];
    lid: Rest[];
  }>({ timeline: null, pose: [], phase: [], running: [], spin: [], board: [], lid: [] });

  useEffect(() => {
    const L = live.current;
    const seedHash = hashString(seed);
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
    const stones = (): StoneLife[] => L.timeline?.stones ?? [];
    const bowlOf = (i: number): Rest => {
      const b = BOWL[stones()[i]!.color];
      return { x: b.x, y: BOWL_HEIGHT - 1.5, z: b.z, rx: 0, rz: 0 };
    };
    const targetOf = (i: number, phase: Phase): Rest =>
      phase === ON_BOARD ? L.board[i]! : phase === IN_LID ? L.lid[i]! : bowlOf(i);

    /** Adopte une nouvelle position : poses de repos, attributs des numéros, pierres en trop. */
    const adopt = (timeline: Timeline): void => {
      L.timeline = timeline;
      const list = timeline.stones;
      // Pierres retirées (annulation d'un coup exploré).
      for (let i = list.length; i < L.pose.length; i++) stop(i);
      L.pose.length = L.phase.length = L.running.length = list.length;
      L.spin.length = L.board.length = L.lid.length = list.length;

      const rank = { B: 0, W: 0 };
      const lidRank = new Map<number, number>();
      list
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.capturedAt !== NEVER)
        .sort((a, b) => a.s.capturedAt - b.s.capturedAt || a.i - b.i)
        .forEach(({ s, i }) => lidRank.set(i, rank[s.color]++));

      const cell = numberGeometry.getAttribute('cell') as THREE.InstancedBufferAttribute;
      const tint = numberGeometry.getAttribute('tint') as THREE.InstancedBufferAttribute;
      list.forEach((s, i) => {
        // Aléa propre à chaque pierre : stable quand la position s'allonge.
        const rnd = mulberry32(seedHash + Math.imul(i + 1, 2654435761));
        L.spin[i] = rnd() * Math.PI * 2;
        const [x, z] = pointToWorld(s.point);
        // Une main ne pose jamais une pierre exactement au centre.
        L.board[i] = {
          x: x + (rnd() - 0.5) * 0.035,
          y: BOARD_TOP,
          z: z + (rnd() - 0.5) * 0.11,
          rx: 0,
          rz: 0,
        };
        // Les pierres noires capturées vont dans le couvercle de Blanc, et inversement.
        const holder = s.color === 'B' ? LID.W : LID.B;
        const k = lidRank.get(i) ?? 0;
        const layer = Math.floor(k / 11);
        const j = k % 11;
        const r = 1.28 * Math.sqrt(j);
        const a = j * 2.39996 + layer * 0.9;
        const tilt = layer === 0 ? 0.12 : 0.5;
        L.lid[i] = {
          x: holder.x + Math.cos(a) * r,
          y: LID_FLOOR + 0.05 + layer * 0.6,
          z: holder.z + Math.sin(a) * r,
          rx: (rnd() - 0.5) * tilt,
          rz: (rnd() - 0.5) * tilt,
        };
        L.pose[i] ??= { ...bowlOf(i), s: 0 };
        L.phase[i] ??= HIDDEN;
        if (i < STONE_CAPACITY * 2) {
          cell.setX(i, Math.max(0, s.placedAt - 1));
          const v = s.color === 'B' ? 0.93 : 0.07;
          tint.setXYZ(i, v, v * 0.98, v * 0.94);
        }
      });
      cell.needsUpdate = true;
      tint.needsUpdate = true;
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
      const timeline = L.timeline;
      if (!marker || !timeline) return;
      markerRun?.stop();
      const i = n > 0 ? (timeline.stoneOfMove[n] ?? -1) : -1;
      if (i < 0 || phaseAt(timeline.stones[i]!, n) !== ON_BOARD) {
        marker.visible = false;
        touch();
        return;
      }
      const at = L.board[i]!;
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
      const stone = stones()[i]!;
      const p = L.pose[i]!;
      const to = L.board[i]!;
      const from = bowlOf(i);
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
      stones().forEach((stone, i) => {
        const phase = phaseAt(stone, n);
        const was = L.phase[i]!;
        const to = targetOf(i, phase);
        const p = L.pose[i]!;
        const busy = L.running[i] !== undefined;
        if (phase === was && !busy) {
          // Au repos : seule sa place dans le couvercle a pu changer (exploration).
          if (phase === IN_LID) settle(i, to, 1);
          return;
        }
        stop(i);
        L.phase[i] = phase;
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

    const sync = (timeline: Timeline, n: number): void => {
      const before = L.timeline;
      const previous = shown;
      if (before === timeline && n === previous) return;
      // La nouvelle position prolonge-t-elle l'ancienne (mêmes pierres, plus éventuellement d'autres) ?
      const continuous =
        before !== null &&
        (before === timeline ||
          samePrefix(before, timeline, Math.min(before.stones.length, timeline.stones.length)));
      if (before !== timeline) adopt(timeline);
      shown = n;
      const { playing, speed, sound } = useStore.getState();
      const reduced = prefersReducedMotion();
      if (previous === -1 || reduced || !continuous || Math.abs(n - previous) !== 1) {
        jump(n, reduced);
        return;
      }
      if (n === previous + 1) {
        // Un coup en avant : le geste doit tenir dans l'intervalle de lecture.
        const duration = playing ? Math.min(PLACE_DURATION, (1 / speed) * 0.85) : PLACE_DURATION;
        const i = timeline.stoneOfMove[n] ?? -1;
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
        return;
      }
      // Un coup en arrière : la pierre retourne au bol, les prisonniers reviennent sur le goban.
      // (Si le coup annulé appartenait à une exploration, sa pierre n'existe déjà plus.)
      stones().forEach((stone, i) => {
        const phase = phaseAt(stone, n);
        if (phase === L.phase[i] && L.running[i] === undefined) return;
        if (phase === HIDDEN) {
          fly(i, HIDDEN, { duration: UNDO_DURATION, delay: 0, lift: 7, endScale: 0 });
        } else if (phase === ON_BOARD) {
          fly(i, ON_BOARD, { duration: UNDO_DURATION + 0.05, delay: 0.05, lift: 6, endScale: 1 });
        }
      });
      setMarker(n, 0);
      touch();
    };

    const pull = (): void => {
      const d = displayOf(useStore.getState());
      if (d) sync(d.timeline, d.move);
    };
    pull();
    const unsubscribe = useStore.subscribe(pull);
    return () => {
      unsubscribe();
      markerRun?.stop();
      L.running.forEach((c) => c?.stop());
      L.timeline = null;
      L.pose = [];
      L.phase = [];
      L.running = [];
    };
  }, [seed, invalidate, numberGeometry]);

  useEffect(() => {
    showNumbersRef.current = showNumbers;
    dirty.current = true;
    invalidate();
  }, [showNumbers, invalidate]);

  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      zero: new THREE.Matrix4().makeScale(0, 0, 0),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(0, 0, 0, 'YXZ'),
      v: new THREE.Vector3(),
      s: new THREE.Vector3(),
      flat: new THREE.Quaternion(),
      used: { B: 0, W: 0, n: 0 },
    }),
    [],
  );

  useLayoutEffect(() => {
    // Avant la première image : toutes les instances à l'échelle nulle.
    for (const mesh of [blackRef.current, whiteRef.current, numbersRef.current]) {
      if (!mesh) continue;
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, scratch.zero);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
    }
  }, [seed, scratch]);

  useFrame(() => {
    if (!dirty.current) return;
    dirty.current = false;
    const black = blackRef.current;
    const white = whiteRef.current;
    const numbers = numbersRef.current;
    const L = live.current;
    const timeline = L.timeline;
    if (!black || !white || !numbers || !timeline) return;
    const { m, zero, q, e, v, s, flat, used } = scratch;
    const numbered = showNumbersRef.current;
    timeline.stones.forEach((stone, i) => {
      const p = L.pose[i];
      if (!p || stone.slot >= STONE_CAPACITY) return;
      const d = (stone.color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE) * p.s;
      e.set(p.rx, L.spin[i] ?? 0, p.rz);
      q.setFromEuler(e);
      m.compose(v.set(p.x, p.y, p.z), q, s.set(d, d, d));
      (stone.color === 'B' ? black : white).setMatrixAt(stone.slot, m);
      if (i < STONE_CAPACITY * 2) {
        const k = numbered && stone.placedAt > 0 && L.phase[i] === ON_BOARD ? p.s : 0;
        m.compose(v.set(p.x, p.y + STONE_THICKNESS + 0.012, p.z), flat, s.set(k, k, k));
        numbers.setMatrixAt(i, m);
      }
    });
    // Efface les instances libérées par une position devenue plus courte.
    const { B, W } = timeline.counts;
    for (let i = B; i < used.B; i++) black.setMatrixAt(i, zero);
    for (let i = W; i < used.W; i++) white.setMatrixAt(i, zero);
    for (let i = timeline.stones.length; i < used.n; i++) numbers.setMatrixAt(i, zero);
    used.B = Math.min(B, STONE_CAPACITY);
    used.W = Math.min(W, STONE_CAPACITY);
    used.n = Math.min(timeline.stones.length, STONE_CAPACITY * 2);
    black.instanceMatrix.needsUpdate = true;
    white.instanceMatrix.needsUpdate = true;
    numbers.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={blackRef}
        args={[assets.geometry, assets.black, STONE_CAPACITY]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={whiteRef}
        args={[assets.geometry, assets.white, STONE_CAPACITY]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={numbersRef}
        args={[numberGeometry, numberMaterial, STONE_CAPACITY * 2]}
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
