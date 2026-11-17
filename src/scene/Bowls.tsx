import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { BOWL, LID, STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE } from './dimensions.ts';
import { bowlGeometry, lidGeometry } from './geometry.ts';
import { OUTLINE, inkMaterial, toon, useLook } from './look.ts';
import { useStoneAssets } from './materials.ts';
import { mulberry32 } from './random.ts';
import { bowlTexture } from './textures.ts';

const MOUND = 46;

/** Réserve de pierres visible dans un bol : un monticule affleurant sous le bord. */
export function Mound({ color }: { color: Color }) {
  const { geometry, black, white } = useStoneAssets();
  const outlined = useLook() === 'manga';
  const ref = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rnd = mulberry32(color === 'B' ? 11 : 23);
    const d = color === 'B' ? STONE_DIAMETER_BLACK : STONE_DIAMETER_WHITE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < MOUND; i++) {
      // Spirale de Vogel : répartition régulière sur un disque, bombée au centre.
      const r = 4.5 * Math.sqrt((i + 0.5) / MOUND);
      const a = i * 2.39996;
      const y = 5.6 + (1 - (r / 4.5) ** 2) * 1.3 + rnd() * 0.5;
      e.set((rnd() - 0.5) * 1.1, rnd() * 6.28, (rnd() - 0.5) * 1.1);
      q.setFromEuler(e);
      p.set(Math.cos(a) * r, y, Math.sin(a) * r);
      mesh.setMatrixAt(i, m.compose(p, q, s.setScalar(d)));
      // Contour : chaque pierre du tas reste lisible, même blanche sur blanche.
      outline.current?.setMatrixAt(i, m.compose(p, q, s.setScalar(d * OUTLINE.stone)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (outline.current) outline.current.instanceMatrix.needsUpdate = true;
  }, [color, outlined]);

  return (
    <>
      {outlined && <instancedMesh ref={outline} args={[geometry, inkMaterial(), MOUND]} />}
      <instancedMesh
        ref={ref}
        args={[geometry, color === 'B' ? black : white, MOUND]}
        castShadow
        receiveShadow
      />
    </>
  );
}

/** Les deux bols et leurs couvercles retournés, à la droite de chaque joueur. */
export function Bowls() {
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const look = useLook();
  const { bowl, lid, material } = useMemo(() => {
    const bowl = bowlGeometry();
    const lid = lidGeometry();
    if (look === 'manga') {
      const material = toon('#7a4f33', [0.45, 0.72, 1]);
      material.side = THREE.DoubleSide;
      return { bowl, lid, material };
    }
    const map = bowlTexture(anisotropy);
    map.repeat.set(2, 1);
    return {
      bowl,
      lid,
      material: new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.34,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
      }),
    };
  }, [anisotropy, look]);
  const outlined = look === 'manga';

  return (
    <>
      {(['B', 'W'] as Color[]).map((c) => (
        <group key={c}>
          <group position={[BOWL[c].x, 0, BOWL[c].z]}>
            <mesh geometry={bowl} material={material} castShadow receiveShadow />
            {outlined && <mesh geometry={bowl} material={inkMaterial()} scale={OUTLINE.bowl} />}
            <Mound color={c} />
          </group>
          <group position={[LID[c].x, 0, LID[c].z]}>
            <mesh geometry={lid} material={material} castShadow receiveShadow />
            {outlined && <mesh geometry={lid} material={inkMaterial()} scale={OUTLINE.bowl} />}
          </group>
        </group>
      ))}
    </>
  );
}
