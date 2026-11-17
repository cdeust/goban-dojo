import * as THREE from 'three';
import { STONE_DIAMETER_BLACK } from './dimensions.ts';
import { stoneGeometry } from './geometry.ts';
import { INK, shellTexture } from './textures.ts';

export interface StoneAssets {
  geometry: THREE.BufferGeometry;
  black: THREE.Material;
  white: THREE.Material;
  /** Contour à l'encre : la face arrière d'une copie légèrement plus grande de la pierre. */
  outline: THREE.Material;
}

/** Grossissement de la copie qui fait le contour d'une pierre. */
export const OUTLINE_SCALE = 1.045;

let assets: StoneAssets | null = null;

/** Géométrie et matériaux des pierres, partagés entre le goban, les bols et les couvercles. */
export function stoneAssets(): StoneAssets {
  assets ??= {
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
    outline: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
  };
  return assets;
}
