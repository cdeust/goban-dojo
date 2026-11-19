import * as THREE from 'three';
import { STONE_DIAMETER_BLACK } from './dimensions.ts';
import { stoneGeometry } from './geometry.ts';
import { shellTexture } from './textures.ts';

export interface StoneAssets {
  geometry: THREE.BufferGeometry;
  black: THREE.Material;
  white: THREE.Material;
  estimateBlack: THREE.Material;
  estimateWhite: THREE.Material;
}

let assets: StoneAssets | null = null;

/** Géométrie et matériaux des pierres, partagés entre le goban, les bols et les couvercles. */
export function stoneAssets(): StoneAssets {
  if (assets) return assets;
  // Ardoise de Nachi : noir mat, satiné.
  const black = new THREE.MeshPhysicalMaterial({
    color: '#131315',
    roughness: 0.46,
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
  });
  // Palourde (hamaguri) : blanc nacré, poli, strié.
  const white = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: shellTexture(),
    roughness: 0.2,
    clearcoat: 0.75,
    clearcoatRoughness: 0.12,
  });
  const estimateBlack = black.clone();
  const estimateWhite = white.clone();
  estimateBlack.color.set('#172338');
  estimateWhite.color.set('#c2dbff');
  estimateWhite.emissive.set('#081634');
  assets = {
    geometry: stoneGeometry(STONE_DIAMETER_BLACK),
    black,
    white,
    estimateBlack,
    estimateWhite,
  };
  return assets;
}
