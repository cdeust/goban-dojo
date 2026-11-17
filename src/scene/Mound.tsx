import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE, STONE_THICKNESS } from './dimensions.ts';
import { stoneAssets } from './materials.ts';
import type { Rigid } from './physics.ts';

/** Réserve de pierres visible dans un bol, aux poses de repos données par la simulation. */
export function Mound({ color, stones }: { color: Color; stones: Rigid[] }) {
  const { geometry, black, white } = stoneAssets();
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(d, d, d);
    stones.forEach((stone, i) => {
      q.set(stone.qx, stone.qy, stone.qz, stone.qw);
      // Le maillage d'une pierre a son origine sous elle ; la simulation donne son centre.
      p.set(0, -STONE_THICKNESS / 2, 0).applyQuaternion(q);
      p.set(p.x + stone.x, p.y + stone.y, p.z + stone.z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, stones]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, color === 'B' ? black : white, stones.length]}
      castShadow
      receiveShadow
    />
  );
}
