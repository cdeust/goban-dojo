import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isEstimating, useStore } from '../state/store.ts';
import { BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH, LEG_HEIGHT } from './dimensions.ts';
import { legGeometry } from './geometry.ts';
import { boardEndTexture, boardSideTexture, boardTopTexture } from './textures.ts';

/** Goban de sol en kaya : plateau massif de 15 cm sur quatre pieds tournés. */
export function Goban() {
  const simulation = useStore(isEstimating);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const { body, materials, leg, legMaterial } = useMemo(() => {
    const wood = (map: THREE.Texture, roughness: number): THREE.MeshPhysicalMaterial =>
      new THREE.MeshPhysicalMaterial({ map, roughness, clearcoat: 0.22, clearcoatRoughness: 0.45 });
    const side = wood(boardSideTexture(anisotropy), 0.55);
    const end = wood(boardEndTexture(anisotropy), 0.62);
    return {
      body: new RoundedBoxGeometry(BOARD_WIDTH, BOARD_THICKNESS, BOARD_LENGTH, 5, 0.28),
      leg: legGeometry(),
      // Ordre des faces d'une boîte : +x, −x, +y, −y, +z, −z. Le fil court dans la longueur (z) :
      // les faces ±z montrent donc le bois de bout.
      materials: [side, side, wood(boardTopTexture(anisotropy), 0.5), side, end, end],
      legMaterial: new THREE.MeshPhysicalMaterial({
        map: boardSideTexture(anisotropy),
        color: '#e8d2a4',
        roughness: 0.6,
        clearcoat: 0.15,
        flatShading: true,
      }),
    };
  }, [anisotropy]);

  useLayoutEffect(() => {
    const top = materials[2]!;
    top.color.set(simulation ? '#5595ff' : '#ffffff');
    top.emissive.set(simulation ? '#102752' : '#000000');
    invalidate();
  }, [simulation, materials, invalidate]);

  const lx = BOARD_WIDTH / 2 - 6.4;
  const lz = BOARD_LENGTH / 2 - 6.4;

  return (
    <group>
      <mesh
        geometry={body}
        material={materials}
        position={[0, LEG_HEIGHT + BOARD_THICKNESS / 2, 0]}
        castShadow
        receiveShadow
      />
      {[
        [lx, lz],
        [-lx, lz],
        [lx, -lz],
        [-lx, -lz],
      ].map(([x, z]) => (
        <mesh
          key={`${x}:${z}`}
          geometry={leg}
          material={legMaterial}
          position={[x as number, 0, z as number]}
          rotation={[0, Math.PI / 8, 0]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
