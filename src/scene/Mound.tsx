import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE, STONE_THICKNESS } from './dimensions.ts';
import { OUTLINE_SCALE, stoneAssets } from './materials.ts';
import type { Rigid } from './physics.ts';

/** Réserve de pierres visible dans un bol, aux poses de repos données par la simulation. */
export function Mound({ color, stones }: { color: Color; stones: Rigid[] }) {
  const { geometry, black, white, outline } = stoneAssets();
  const fill = useRef<THREE.InstancedMesh>(null);
  const edge = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const d = color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    stones.forEach((stone, i) => {
      q.set(stone.qx, stone.qy, stone.qz, stone.qw);
      // Le maillage d'une pierre a son origine sous elle ; la simulation donne son centre.
      p.set(0, -STONE_THICKNESS / 2, 0).applyQuaternion(q);
      p.set(p.x + stone.x, p.y + stone.y, p.z + stone.z);
      fill.current?.setMatrixAt(i, m.compose(p, q, s.setScalar(d)));
      // Chaque pierre du tas reste lisible, même blanche sur blanche.
      edge.current?.setMatrixAt(i, m.compose(p, q, s.setScalar(d * OUTLINE_SCALE)));
    });
    for (const mesh of [fill.current, edge.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [color, stones]);

  return (
    <>
      <instancedMesh ref={edge} args={[geometry, outline, stones.length]} />
      <instancedMesh
        ref={fill}
        args={[geometry, color === 'B' ? black : white, stones.length]}
        castShadow
        receiveShadow
      />
    </>
  );
}
