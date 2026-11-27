import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { POINTS } from '../domain/board.ts';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { useStore } from '../state/store.ts';
import { parseTacticalCueKey, TACTICAL_CUES, tacticalCueKey } from '../state/tacticalCues.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, pointToWorld } from './dimensions.ts';
import { haloTexture } from './textures.ts';

const REST_OPACITY = 0.43;

/** Un seul halo au sol par point, sans éclair, animation cyclique ni recouvrement des numéros. */
export function Marks() {
  const key = useStore(tacticalCueKey);
  const invalidate = useThree((s) => s.invalidate);
  const halos = useRef<THREE.InstancedMesh>(null);
  const assets = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    const map = haloTexture();
    const material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { plane, material, map };
  }, []);
  useEffect(
    () => () => {
      assets.plane.dispose();
      assets.material.dispose();
      assets.map.dispose();
    },
    [assets],
  );

  useLayoutEffect(() => {
    const mesh = halos.current;
    if (!mesh) return;
    const points = parseTacticalCueKey(key);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const size = STONE_DIAMETER_BLACK * 1.8;
    for (const [i, { point, kind }] of points.entries()) {
      const [x, z] = pointToWorld(point);
      matrix.makeScale(size, 1, size).setPosition(x, BOARD_TOP + 0.016 + i * 0.00005, z);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(TACTICAL_CUES[kind].color));
    }
    mesh.count = points.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const still = prefersReducedMotion();
    assets.material.opacity = points.length ? (still ? REST_OPACITY : 0.78) : 0;
    invalidate();
    if (still || !points.length) return;
    const fade = animate(0.78, REST_OPACITY, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (opacity) => {
        assets.material.opacity = opacity;
        invalidate();
      },
    });
    return () => fade.stop();
  }, [key, assets, invalidate]);

  return (
    <instancedMesh
      ref={halos}
      args={[assets.plane, assets.material, POINTS]}
      frustumCulled={false}
      renderOrder={1}
      raycast={() => null}
    />
  );
}
