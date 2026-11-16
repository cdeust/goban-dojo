/**
 * Le style de rendu. Géométrie, animation et effets sont communs ; un style ne fournit que des
 * matériaux, un éclairage et, pour le manga, des contours. Tout ce qui distingue les deux styles
 * est dans ce fichier et dans les textures qu'il appelle.
 */
import * as THREE from 'three';
import { useStore, type Look } from '../state/store.ts';
import { INK } from './textures.ts';

export const useLook = (): Look => useStore((s) => s.look);

/**
 * Rampe d'ombrage en aplats : chaque valeur (0 à 1) est la luminosité d'une bande, de la face la
 * moins éclairée à la plus éclairée. Pas d'interpolation : la transition est un trait net.
 */
export function toonRamp(bands: number[]): THREE.DataTexture {
  const data = new Uint8Array(bands.length * 4);
  bands.forEach((v, i) => {
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255);
    data.set([b, b, b, 255], i * 4);
  });
  const texture = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Matériau en aplats. */
export function toon(
  color: THREE.ColorRepresentation,
  bands: number[],
  map?: THREE.Texture,
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(bands),
    ...(map ? { map } : {}),
  });
}

let ink: THREE.MeshBasicMaterial | null = null;

/** Encre des contours : la face arrière d'une copie légèrement plus grande de l'objet. */
export function inkMaterial(): THREE.MeshBasicMaterial {
  ink ??= new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  return ink;
}

/** Grossissement de la copie qui fait le contour, selon la taille de l'objet. */
export const OUTLINE = {
  stone: 1.075,
  board: 1.012,
  leg: 1.07,
  bowl: 1.035,
  cushion: 1.02,
} as const;
