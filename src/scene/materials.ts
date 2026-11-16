import { useMemo } from 'react';
import * as THREE from 'three';
import { STONE_DIAMETER_BLACK } from './dimensions.ts';
import { stoneGeometry } from './geometry.ts';
import { shellTexture } from './textures.ts';

export interface StoneAssets {
  geometry: THREE.BufferGeometry;
  black: THREE.Material;
  white: THREE.Material;
}

let cached: StoneAssets | null = null;

/** Géométrie et matériaux des pierres, partagés entre le goban, les bols et les couvercles. */
export function useStoneAssets(): StoneAssets {
  return useMemo(() => {
    cached ??= {
      geometry: stoneGeometry(STONE_DIAMETER_BLACK),
      // Ardoise de Nachi : noir mat, satiné.
      black: new THREE.MeshPhysicalMaterial({
        color: '#131315',
        roughness: 0.46,
        clearcoat: 0.18,
        clearcoatRoughness: 0.55,
      }),
      // Palourde (hamaguri) : blanc nacré, poli, strié.
      white: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        map: shellTexture(),
        roughness: 0.2,
        clearcoat: 0.75,
        clearcoatRoughness: 0.12,
      }),
    };
    return cached;
  }, []);
}
