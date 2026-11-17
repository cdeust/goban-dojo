/** Textures procédurales (canvas 2D) des pierres : aucun fichier image à charger. */
import * as THREE from 'three';
import { mulberry32 } from './random.ts';

/** Encre des contours et des marques. */
export const INK = '#17130f';

/** Stries (shima) de la coquille de palourde des pierres blanches. */
export function shellTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  const rnd = mulberry32(1848);
  ctx.fillStyle = '#f6f3ea';
  ctx.fillRect(0, 0, S, S);
  for (let y = -10; y < S + 10;) {
    y += 5 + rnd() * 7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(S / 2, y + 7, S, y);
    ctx.strokeStyle = `rgba(150,140,118,${0.1 + rnd() * 0.14})`;
    ctx.lineWidth = 0.8 + rnd() * 1.4;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const ATLAS_COLUMNS = 20;
export const ATLAS_ROWS = 20;

/** Atlas des numéros de coups 1…400, blanc sur transparent (teinté par le shader). */
export function numberAtlas(): THREE.CanvasTexture {
  const cell = 96;
  const c = document.createElement('canvas');
  c.width = ATLAS_COLUMNS * cell;
  c.height = ATLAS_ROWS * cell;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let n = 1; n <= ATLAS_COLUMNS * ATLAS_ROWS; n++) {
    const i = n - 1;
    const size = n < 10 ? 62 : n < 100 ? 54 : 42;
    ctx.font = `600 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.fillText(
      String(n),
      (i % ATLAS_COLUMNS) * cell + cell / 2,
      Math.floor(i / ATLAS_COLUMNS) * cell + cell / 2 + 3,
    );
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}
