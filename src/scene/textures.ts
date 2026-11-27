/**
 * Textures entièrement procédurales (canvas 2D) : aucun fichier image à charger,
 * donc aucune dépendance à un tiers ni question de droits.
 */
import * as THREE from 'three';
import {
  BOARD_LENGTH,
  BOARD_WIDTH,
  GRID_SIZE,
  HOSHI_DIAMETER,
  LINE_WIDTH,
  PITCH_X,
  PITCH_Z,
} from './dimensions.ts';
import { mulberry32 } from './random.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  return [c, ctx];
}

function finish(c: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Dégradé de halo, opaque au centre puis transparent au bord. */
export function haloTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, size * 0.24, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Fil droit (masame) du kaya : fines veines parallèles légèrement ondulées. */
function paintStraightGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  vertical: boolean,
): void {
  const rnd = mulberry32(seed);
  const base = ctx.createLinearGradient(0, 0, vertical ? w : 0, vertical ? 0 : h);
  base.addColorStop(0, '#d8ae62');
  base.addColorStop(0.35, '#dfb86c');
  base.addColorStop(0.7, '#d6aa5c');
  base.addColorStop(1, '#dcb266');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const across = vertical ? w : h;
  const along = vertical ? h : w;
  // Larges bandes de teinte : alternance bois d'été / bois de printemps.
  for (let p = 0; p < across;) {
    const band = 18 + rnd() * 70;
    ctx.fillStyle =
      rnd() > 0.5
        ? `rgba(120,78,28,${0.03 + rnd() * 0.05})`
        : `rgba(255,236,180,${0.03 + rnd() * 0.05})`;
    if (vertical) ctx.fillRect(p, 0, band, h);
    else ctx.fillRect(0, p, w, band);
    p += band;
  }
  // Veines.
  const f1 = 1.5 + rnd() * 1.5;
  const f2 = 4 + rnd() * 3;
  for (let p = -20; p < across + 20;) {
    p += 2.2 + rnd() * 6.5;
    const amp1 = 3 + rnd() * 5;
    const amp2 = 0.6 + rnd() * 1.2;
    const ph1 = rnd() * 6.28;
    const ph2 = rnd() * 6.28;
    ctx.beginPath();
    for (let q = 0; q <= along; q += 16) {
      const u = q / along;
      const o =
        p + Math.sin(u * f1 * 6.28 + ph1 + p * 0.002) * amp1 + Math.sin(u * f2 * 6.28 + ph2) * amp2;
      const [x, y] = vertical ? [o, q] : [q, o];
      if (q === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${105 + rnd() * 30},${62 + rnd() * 20},${18 + rnd() * 14},${0.05 + rnd() * 0.16})`;
    ctx.lineWidth = 0.5 + rnd() * 1.6;
    ctx.stroke();
  }
  // Pores : petits traits sombres dans le sens du fil.
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 3 + rnd() * 9;
    ctx.fillStyle = `rgba(90,55,20,${0.05 + rnd() * 0.08})`;
    if (vertical) ctx.fillRect(x, y, 0.8, len);
    else ctx.fillRect(x, y, len, 0.8);
  }
}

/** Lignes et hoshi du goban, aux cotes réelles, sur un canvas couvrant tout le dessus du plateau. */
function paintGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const s = W / BOARD_WIDTH; // pixels par centimètre
  const x0 = W / 2 - 9 * PITCH_X * s;
  const y0 = H / 2 - 9 * PITCH_Z * s;
  ctx.strokeStyle = 'rgba(22,16,11,0.93)';
  ctx.lineWidth = LINE_WIDTH * s;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let i = 0; i < GRID_SIZE; i++) {
    const x = x0 + i * PITCH_X * s;
    const y = y0 + i * PITCH_Z * s;
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + 18 * PITCH_Z * s);
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + 18 * PITCH_X * s, y);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(22,16,11,0.95)';
  for (const i of [3, 9, 15]) {
    for (const j of [3, 9, 15]) {
      ctx.beginPath();
      ctx.arc(x0 + i * PITCH_X * s, y0 + j * PITCH_Z * s, (HOSHI_DIAMETER / 2) * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Dessus du goban : kaya à fil droit, lignes laquées et neuf hoshi, aux cotes réelles. */
export function boardTopTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round((W * BOARD_LENGTH) / BOARD_WIDTH);
  const [c, ctx] = canvas(W, H);
  paintStraightGrain(ctx, W, H, 1829, true);

  paintGrid(ctx, W, H);
  return finish(c, anisotropy);
}

/** Flancs longs du goban : fil droit horizontal. */
export function boardSideTexture(anisotropy: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 512);
  paintStraightGrain(ctx, 1024, 512, 1846, false);
  return finish(c, anisotropy);
}

/** Bois de bout (koguchi) : cernes de croissance en arcs. */
export function boardEndTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const rnd = mulberry32(1862);
  ctx.fillStyle = '#cfa258';
  ctx.fillRect(0, 0, W, H);
  // Le cœur de l'arbre est loin sous le plateau : les cernes apparaissent comme de grands arcs.
  const cx = W * 0.42;
  const cy = H * 3.4;
  for (let r = H * 2.3; r < H * 3.7;) {
    r += 3 + rnd() * 9;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = `rgba(110,66,22,${0.1 + rnd() * 0.22})`;
    ctx.lineWidth = 0.8 + rnd() * 2.4;
    ctx.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(80,48,16,${0.04 + rnd() * 0.08})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.2, 1.2);
  }
  return finish(c, anisotropy);
}

/** Bois sombre des bols (châtaignier teinté). */
export function bowlTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rnd = mulberry32(1837);
  ctx.fillStyle = '#4a2c18';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H;) {
    y += 1.5 + rnd() * 5;
    const amp = 2 + rnd() * 5;
    const ph = rnd() * 6.28;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      // Période entière sur la largeur : la texture boucle autour du bol sans couture.
      const o = y + Math.sin((x / W) * 6.28 * 2 + ph) * amp;
      if (x === 0) ctx.moveTo(x, o);
      else ctx.lineTo(x, o);
    }
    ctx.strokeStyle =
      rnd() > 0.4
        ? `rgba(20,10,4,${0.12 + rnd() * 0.25})`
        : `rgba(150,96,50,${0.06 + rnd() * 0.12})`;
    ctx.lineWidth = 0.6 + rnd() * 2;
    ctx.stroke();
  }
  const t = finish(c, anisotropy);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Un tatami (91 × 182 cm) : natte de jonc tressé bordée de deux galons sombres (heri). */
export function tatamiTexture(anisotropy: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 2048;
  const [c, ctx] = canvas(W, H);
  const rnd = mulberry32(1840);
  ctx.fillStyle = '#b3a56c';
  ctx.fillRect(0, 0, W, H);
  // Brins de jonc : fines rayures dans la largeur du tatami.
  for (let y = 0; y < H; y += 3) {
    const v = rnd();
    ctx.fillStyle = `rgba(${v > 0.5 ? '232,222,160' : '92,84,44'},${0.05 + rnd() * 0.12})`;
    ctx.fillRect(0, y, W, 1.5 + rnd());
  }
  // Fils de chaîne : légers creux réguliers dans la longueur.
  for (let x = 0; x < W; x += 17) {
    ctx.fillStyle = 'rgba(70,62,30,0.10)';
    ctx.fillRect(x, 0, 2, H);
    ctx.fillStyle = 'rgba(240,232,180,0.05)';
    ctx.fillRect(x + 2, 0, 2, H);
  }
  // Usure : taches de teinte très diffuses.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 80 + rnd() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rnd() > 0.5 ? '210,196,130' : '120,110,60'},0.07)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Galons (heri) le long des deux grands côtés, ~3 cm chacun.
  const heri = Math.round((3 / 91) * W);
  for (const x of [0, W - heri]) {
    ctx.fillStyle = '#161b19';
    ctx.fillRect(x, 0, heri, H);
    for (let y = 0; y < H; y += 6) {
      ctx.fillStyle = `rgba(70,84,78,${0.12 + rnd() * 0.1})`;
      ctx.fillRect(x, y, heri, 1.5);
    }
  }
  // Joint sombre entre deux nattes.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 2, H);
  ctx.fillRect(W - 2, 0, 2, H);
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
  const t = finish(c, anisotropy);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Stries (shima) de la coquille de palourde des pierres blanches. */
export function shellTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
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
  return finish(c, 4);
}

/** Dix chiffres réutilisables, même au-delà des 720 coups de l'ancien atlas. */
export function numberAtlas(): THREE.CanvasTexture {
  const cell = 40;
  const [c, ctx] = canvas(10 * cell, 64);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 44px "Helvetica Neue", Helvetica, Arial, sans-serif';
  for (let digit = 0; digit < 10; digit++) {
    ctx.fillText(String(digit), (digit + 0.5) * cell, 35);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** Encre des tracés du salon. */
export const INK = '#17130f';
