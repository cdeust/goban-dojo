import { useMemo } from 'react';
import * as THREE from 'three';
import type { Look } from '../state/store.ts';
import { STONE_DIAMETER_BLACK } from './dimensions.ts';
import { stoneGeometry } from './geometry.ts';
import { toon, useLook } from './look.ts';
import { shellTexture } from './textures.ts';

export interface StoneAssets {
  geometry: THREE.BufferGeometry;
  black: THREE.Material;
  white: THREE.Material;
}

let geometry: THREE.BufferGeometry | null = null;
const cache = new Map<Look, { black: THREE.Material; white: THREE.Material }>();

function build(look: Look): { black: THREE.Material; white: THREE.Material } {
  if (look === 'manga') {
    return {
      // Noir d'encre. Seize bandes dont une seule claire : le reflet n'apparaît que là où la
      // surface fait presque face à la lumière — un point net, comme sur une pierre dessinée.
      black: toon('#ffffff', [...Array<number>(14).fill(0.07), 0.2, 0.97]),
      white: toon('#fdfaf2', [0.66, 0.9, 1, 1]),
    };
  }
  return {
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
}

/** Géométrie et matériaux des pierres, partagés entre le goban, les bols et les couvercles. */
export function useStoneAssets(): StoneAssets {
  const look = useLook();
  return useMemo(() => {
    geometry ??= stoneGeometry(STONE_DIAMETER_BLACK);
    let materials = cache.get(look);
    if (!materials) {
      materials = build(look);
      cache.set(look, materials);
    }
    return { geometry, ...materials };
  }, [look]);
}
