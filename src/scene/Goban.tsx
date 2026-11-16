import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD_LENGTH, BOARD_THICKNESS, BOARD_WIDTH, LEG_HEIGHT } from './dimensions.ts';
import { legGeometry } from './geometry.ts';
import { OUTLINE, inkMaterial, toon, useLook } from './look.ts';
import {
  boardEndTexture,
  boardSideTexture,
  boardTopTexture,
  inkBoardEndTexture,
  inkBoardSideTexture,
  inkBoardTopTexture,
} from './textures.ts';

/** Goban de sol en kaya : plateau massif de 15 cm sur quatre pieds tournés. */
export function Goban() {
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const look = useLook();

  const { body, materials, leg, legMaterial } = useMemo(() => {
    const body = new RoundedBoxGeometry(BOARD_WIDTH, BOARD_THICKNESS, BOARD_LENGTH, 5, 0.28);
    const leg = legGeometry();
    // Ordre des faces d'une boîte : +x, −x, +y, −y, +z, −z. Le fil court dans la longueur (z) :
    // les faces ±z montrent donc le bois de bout.
    if (look === 'manga') {
      const top = toon('#ffffff', [0.86, 1], inkBoardTopTexture(anisotropy));
      const side = toon('#ffffff', [0.78, 1], inkBoardSideTexture(anisotropy));
      const end = toon('#ffffff', [0.78, 1], inkBoardEndTexture(anisotropy));
      return {
        body,
        leg,
        materials: [side, side, top, side, end, end],
        legMaterial: toon('#d6b06c', [0.6, 0.82, 1]),
      };
    }
    const wood = (map: THREE.Texture, roughness: number): THREE.MeshPhysicalMaterial =>
      new THREE.MeshPhysicalMaterial({ map, roughness, clearcoat: 0.22, clearcoatRoughness: 0.45 });
    const side = wood(boardSideTexture(anisotropy), 0.55);
    const end = wood(boardEndTexture(anisotropy), 0.62);
    return {
      body,
      leg,
      materials: [side, side, wood(boardTopTexture(anisotropy), 0.5), side, end, end],
      legMaterial: new THREE.MeshPhysicalMaterial({
        map: boardSideTexture(anisotropy),
        color: '#e8d2a4',
        roughness: 0.6,
        clearcoat: 0.15,
        flatShading: true,
      }),
    };
  }, [anisotropy, look]);

  const lx = BOARD_WIDTH / 2 - 6.4;
  const lz = BOARD_LENGTH / 2 - 6.4;
  const y = LEG_HEIGHT + BOARD_THICKNESS / 2;
  const outlined = look === 'manga';

  return (
    <group>
      <mesh geometry={body} material={materials} position={[0, y, 0]} castShadow receiveShadow />
      {outlined && (
        <mesh geometry={body} material={inkMaterial()} position={[0, y, 0]} scale={OUTLINE.board} />
      )}
      {[
        [lx, lz],
        [-lx, lz],
        [lx, -lz],
        [-lx, -lz],
      ].map(([x, z]) => (
        <group
          key={`${x}:${z}`}
          position={[x as number, 0, z as number]}
          rotation={[0, Math.PI / 8, 0]}
        >
          <mesh geometry={leg} material={legMaterial} castShadow receiveShadow />
          {outlined && <mesh geometry={leg} material={inkMaterial()} scale={OUTLINE.leg} />}
        </group>
      ))}
    </group>
  );
}
