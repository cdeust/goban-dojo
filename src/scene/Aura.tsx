import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { setProjector } from '../state/projection.ts';
import { atariOf, useStore } from '../state/store.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, STONE_THICKNESS, pointToWorld } from './dimensions.ts';

/** Nombre maximal de pierres en atari signalées à la fois. */
const CAPACITY = 96;
const VERMILION = '#e0553a';

/** Dégradé radial doux, blanc au centre : la couleur vient du matériau. */
function glowTexture(inner: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(inner, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * L'« air de menace » : une lueur sourde sous chaque pierre en atari, qui bat lentement, et un
 * éclat sous la pierre qui vient de menacer ou de capturer. Publie aussi la projection à l'écran
 * des intersections, pour les effets dessinés par l'interface.
 */
export function Aura() {
  const enabled = useStore((s) => s.effects);
  const atari = useStore((s) => (s.effects ? atariOf(s).join(',') : ''));
  const impact = useStore((s) => s.impact);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const rings = useRef<THREE.InstancedMesh>(null);
  const flash = useRef<THREE.Mesh>(null);

  const assets = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    const material = (map: THREE.Texture): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        map,
        color: VERMILION,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    return { plane, ring: material(glowTexture(0.55)), flash: material(glowTexture(0.15)) };
  }, []);

  // Projection d'une intersection vers l'écran, pour l'interface.
  useEffect(() => {
    const v = new THREE.Vector3();
    const edge = new THREE.Vector3();
    setProjector((point) => {
      const [x, z] = pointToWorld(point);
      const rect = gl.domElement.getBoundingClientRect();
      const toScreen = (t: THREE.Vector3): [number, number] => [
        rect.left + ((t.x + 1) / 2) * rect.width,
        rect.top + ((1 - t.y) / 2) * rect.height,
      ];
      v.set(x, BOARD_TOP + STONE_THICKNESS, z).project(camera);
      if (v.z < -1 || v.z > 1) return null;
      edge.set(x + STONE_DIAMETER_BLACK / 2, BOARD_TOP + STONE_THICKNESS, z).project(camera);
      const [sx, sy] = toScreen(v);
      const [ex, ey] = toScreen(edge);
      return { x: sx, y: sy, size: Math.max(8, 2 * Math.hypot(ex - sx, ey - sy)) };
    });
    return () => setProjector(null);
  }, [camera, gl]);

  // Une lueur sous chaque pierre en atari.
  useLayoutEffect(() => {
    const mesh = rings.current;
    if (!mesh) return;
    const points = atari === '' ? [] : atari.split(',').map(Number);
    const m = new THREE.Matrix4();
    const size = STONE_DIAMETER_BLACK * 1.9;
    points.slice(0, CAPACITY).forEach((p, i) => {
      const [x, z] = pointToWorld(p);
      m.makeScale(size, 1, size).setPosition(x, BOARD_TOP + 0.015, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = Math.min(points.length, CAPACITY);
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
    if (mesh.count === 0) {
      assets.ring.opacity = 0;
      return;
    }
    if (prefersReducedMotion()) {
      assets.ring.opacity = 0.5;
      return;
    }
    // Battement lent : la menace respire.
    const pulse = animate(0.28, 0.72, {
      duration: 1.3,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
      onUpdate: (v) => {
        assets.ring.opacity = v;
        invalidate();
      },
    });
    return () => pulse.stop();
  }, [atari, assets, invalidate]);

  // Un éclat sous la pierre qui vient de menacer.
  useEffect(() => {
    const mesh = flash.current;
    if (!mesh || !impact || !enabled || impact.kind === 'coup') return;
    const [x, z] = pointToWorld(impact.point);
    mesh.position.set(x, BOARD_TOP + 0.02, z);
    const peak = impact.kind === 'moment' ? 1 : 0.75;
    const reach = impact.kind === 'moment' ? 15 : 8;
    if (prefersReducedMotion()) return;
    const run = animate(0, 1, {
      duration: impact.kind === 'moment' ? 2.4 : 0.9,
      ease: 'easeOut',
      onUpdate: (t) => {
        mesh.scale.setScalar(STONE_DIAMETER_BLACK * (1.2 + t * reach));
        assets.flash.opacity = peak * (1 - t) ** 1.5;
        invalidate();
      },
    });
    return () => {
      run.stop();
      assets.flash.opacity = 0;
      invalidate();
    };
  }, [impact, enabled, assets, invalidate]);

  return (
    <group visible={enabled}>
      <instancedMesh
        ref={rings}
        args={[assets.plane, assets.ring, CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
      <mesh ref={flash} geometry={assets.plane} material={assets.flash} renderOrder={1} />
    </group>
  );
}
