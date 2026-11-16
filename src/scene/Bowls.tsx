import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { BOWL, LID, STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE } from './dimensions.ts';
import { bowlGeometry, lidGeometry } from './geometry.ts';
import { useStoneAssets } from './materials.ts';
import { mulberry32 } from './random.ts';
import { bowlTexture } from './textures.ts';

const MOUND = 46;

/** Réserve de pierres visible dans un bol : un monticule affleurant sous le bord. */
function Mound({ color }: { color: Color }) {
  const { geometry, black, white } = useStoneAssets();
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rnd = mulberry32(color === 'B' ? 11 : 23);
    const d = color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < MOUND; i++) {
      // Spirale de Vogel : répartition régulière sur un disque, bombée au centre.
      const r = 4.5 * Math.sqrt((i + 0.5) / MOUND);
      const a = i * 2.39996;
      const y = 5.6 + (1 - (r / 4.5) ** 2) * 1.3 + rnd() * 0.5;
      e.set((rnd() - 0.5) * 1.1, rnd() * 6.28, (rnd() - 0.5) * 1.1);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
        q,
        new THREE.Vector3(d, d, d),
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [color]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, color === 'B' ? black : white, MOUND]}
      castShadow
      receiveShadow
    />
  );
}

/** Les deux bols et leurs couvercles retournés, à la droite de chaque joueur. */
export function Bowls() {
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const { bowl, lid, material } = useMemo(() => {
    const map = bowlTexture(anisotropy);
    map.repeat.set(2, 1);
    return {
      bowl: bowlGeometry(),
      lid: lidGeometry(),
      material: new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.34,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
      }),
    };
  }, [anisotropy]);

  return (
    <>
      {(['B', 'W'] as Color[]).map((c) => (
        <group key={c}>
          <group position={[BOWL[c].x, 0, BOWL[c].z]}>
            <mesh geometry={bowl} material={material} castShadow receiveShadow />
            <Mound color={c} />
          </group>
          <mesh
            geometry={lid}
            material={material}
            position={[LID[c].x, 0, LID[c].z]}
            castShadow
            receiveShadow
          />
        </group>
      ))}
    </>
  );
}
