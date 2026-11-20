import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { reflectionsOf } from '../state/reflections.ts';
import { setProjector } from '../state/projection.ts';
import { marksOf, showsEarRedMove, isEstimating, useStore } from '../state/store.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, STONE_THICKNESS, pointToWorld } from './dimensions.ts';
import { haloTexture, INK } from './textures.ts';

/** Nombre maximal de pierres marquées à la fois, par type de marque. */
const CAPACITY = 96;
const INITIATIVE_GLOW = '#58aafa';

/** Couleur de chaque notion. */
export const MARK_COLORS = {
  /** Attaque : pierres en atari, coup qui capture. */
  attack: '#e0553a',
  /** Connexion : le coup et les pierres qu'il relie. */
  connection: '#2f6fb3',
  /** Piège : pierres prises dans un shicho qui fonctionne. */
  trap: INK,
} as const;

function texture(
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  paint(ctx, size);
  return new THREE.CanvasTexture(canvas);
}

/** Cage : anneau de traits épais et interrompus, comme des barreaux vus de dessus. */
const cageTexture = (): THREE.CanvasTexture =>
  texture((ctx, s) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s * 0.075;
    ctx.setLineDash([s * 0.105, s * 0.075]);
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  });

/**
 * Ce que la position donne à lire, dessiné sur le plateau sous les pierres :
 *  - attaque : un halo vermillon bat sous chaque pierre en atari ;
 *  - piège : une cage d'encre tourne autour des pierres prises en shicho ;
 *  - connexion : un halo bleu sous le coup et les pierres qu'il vient de relier ;
 * Publie aussi la projection à l'écran des intersections, pour les effets de l'interface.
 */
export function Marks() {
  const enabled = useStore((s) => s.effects);
  // Clé stable tant que les marques ne changent pas : évite de tout reconstruire à chaque coup.
  const key = useStore((s) => {
    if (!s.effects || isEstimating(s)) return '';
    const m = marksOf(s);
    const linked = m.threat.connects.length > 0 ? [m.last, ...m.threat.connects] : [];
    const game = s.dataset?.games[s.gameIndex];
    const scenes = game ? reflectionsOf(game) : [];
    const target =
      s.variation.length === 0 && ((s.mode === 'lecture' && !s.playing) || s.mode === 'reflechir')
        ? scenes.find(({ after }) => after === s.move)?.tactical
        : undefined;
    const initiative = new Set([...(target?.captures ?? []), ...(target?.atari ?? [])]);
    if (
      (game && showsEarRedMove(game, s.move, s.variation)) ||
      (s.variation.length === 0 && scenes.some(({ tactical }) => tactical?.number === s.move))
    ) {
      initiative.add(m.last);
    }
    return `${m.atari.join(',')}|${m.trapped.join(',')}|${linked.join(',')}|${[...initiative].join(',')}`;
  });
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const halos = useRef<THREE.InstancedMesh>(null);
  const cages = useRef<THREE.InstancedMesh>(null);

  const assets = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    const material = (
      map: THREE.Texture,
      color: THREE.ColorRepresentation,
    ): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        map,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    return {
      plane,
      halo: material(haloTexture(), '#ffffff'),
      cage: new THREE.MeshBasicMaterial({
        map: cageTexture(),
        color: '#ff934b',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    };
  }, []);

  // Projection d'une intersection vers l'écran, pour l'interface.
  useEffect(() => {
    const v = new THREE.Vector3();
    const edge = new THREE.Vector3();
    setProjector((point, surface) => {
      const [x, z] = pointToWorld(point);
      const rect = gl.domElement.getBoundingClientRect();
      const toScreen = (t: THREE.Vector3): [number, number] => [
        rect.left + ((t.x + 1) / 2) * rect.width,
        rect.top + ((1 - t.y) / 2) * rect.height,
      ];
      v.set(x, BOARD_TOP + (surface ? 0.025 : STONE_THICKNESS), z).project(camera);
      if (v.z < -1 || v.z > 1) return null;
      edge.set(x + STONE_DIAMETER_BLACK / 2, BOARD_TOP + STONE_THICKNESS, z).project(camera);
      const [sx, sy] = toScreen(v);
      const [ex, ey] = toScreen(edge);
      return { x: sx, y: sy, size: Math.max(8, 2 * Math.hypot(ex - sx, ey - sy)) };
    });
    return () => setProjector(null);
  }, [camera, gl]);

  useLayoutEffect(() => {
    const haloMesh = halos.current;
    const cageMesh = cages.current;
    if (!haloMesh || !cageMesh) return;
    const [atari = '', trapped = '', linked = '', initiative = ''] = key.split('|');
    const list = (s: string): number[] => (s === '' ? [] : s.split(',').map(Number));
    const m = new THREE.Matrix4();
    const color = new THREE.Color();

    // Halos : connexion d'abord, attaque par-dessus si une pierre porte les deux.
    const haloSize = STONE_DIAMETER_BLACK * 1.95;
    let n = 0;
    const put = (points: number[], tint: string): void => {
      for (const p of points) {
        if (n >= CAPACITY) return;
        const [x, z] = pointToWorld(p);
        m.makeScale(haloSize, 1, haloSize).setPosition(x, BOARD_TOP + 0.015 + n * 0.0001, z);
        haloMesh.setMatrixAt(n, m);
        haloMesh.setColorAt(n, color.set(tint));
        n++;
      }
    };
    put(list(linked), MARK_COLORS.connection);
    put(list(atari), MARK_COLORS.attack);
    put(list(initiative), INITIATIVE_GLOW);
    haloMesh.count = n;
    haloMesh.instanceMatrix.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;

    const caged = list(trapped).slice(0, CAPACITY);
    const cageSize = STONE_DIAMETER_BLACK * 1.5;
    const place = (angle: number): void => {
      caged.forEach((p, i) => {
        const [x, z] = pointToWorld(p);
        m.makeRotationY(angle)
          .scale(new THREE.Vector3(cageSize, 1, cageSize))
          .setPosition(x, BOARD_TOP + STONE_THICKNESS, z);
        cageMesh.setMatrixAt(i, m);
      });
      cageMesh.instanceMatrix.needsUpdate = true;
    };
    cageMesh.count = caged.length;
    place(0);

    const still = prefersReducedMotion();
    assets.halo.opacity = n > 0 ? 0.6 : 0;
    assets.cage.opacity = caged.length > 0 ? 1 : 0;
    invalidate();
    if (still || (n === 0 && caged.length === 0)) return;
    // Les halos battent lentement ; les cages tournent, comme un étau qui se resserre.
    const pulse = animate(0, 1, {
      duration: 1.3,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
      onUpdate: (t) => {
        assets.halo.opacity = 0.38 + t * 0.47;
        invalidate();
      },
    });
    const turn =
      caged.length > 0
        ? animate(0, Math.PI * 2, {
            duration: 9,
            repeat: Infinity,
            ease: 'linear',
            onUpdate: (a) => {
              place(a);
              invalidate();
            },
          })
        : null;
    return () => {
      pulse.stop();
      turn?.stop();
    };
  }, [key, assets, invalidate]);

  return (
    <group visible={enabled}>
      <instancedMesh
        ref={halos}
        args={[assets.plane, assets.halo, CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh
        ref={cages}
        args={[assets.plane, assets.cage, CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
    </group>
  );
}
