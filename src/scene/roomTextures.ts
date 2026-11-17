/**
 * Textures du salon (washitsu), dessinées au trait sur canvas : tatamis bordés, shōji, fusuma,
 * mur d'argile, rouleau du tokonoma.
 */
import * as THREE from 'three';
import { mulberry32 } from './random.ts';
import { INK } from './textures.ts';

function make(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, rnd: () => number) => void,
  seed: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponible');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx, mulberry32(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Bois sombre des huisseries et des poteaux. */
export const TIMBER = '#5a3d27';

/** Un panneau de shōji : papier blanc tendu sur un treillis de bois. */
export function shojiTexture(): THREE.CanvasTexture {
  return make(
    512,
    1024,
    (ctx) => {
      ctx.fillStyle = '#fbf6e9';
      ctx.fillRect(0, 0, 512, 1024);
      ctx.strokeStyle = TIMBER;
      // Treillis (kumiko) : 4 colonnes, 7 rangées.
      ctx.lineWidth = 7;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((i * 512) / 4, 0);
        ctx.lineTo((i * 512) / 4, 800);
        ctx.stroke();
      }
      for (let j = 1; j < 7; j++) {
        ctx.beginPath();
        ctx.moveTo(0, (j * 800) / 7);
        ctx.lineTo(512, (j * 800) / 7);
        ctx.stroke();
      }
      // Soubassement de bois plein (koshi-ita) et cadre.
      ctx.fillStyle = '#b98e5c';
      ctx.fillRect(0, 800, 512, 224);
      ctx.strokeStyle = 'rgba(60,38,20,0.35)';
      ctx.lineWidth = 3;
      for (let x = 40; x < 512; x += 62) {
        ctx.beginPath();
        ctx.moveTo(x, 812);
        ctx.lineTo(x + 6, 1012);
        ctx.stroke();
      }
      ctx.strokeStyle = TIMBER;
      ctx.lineWidth = 26;
      ctx.strokeRect(13, 13, 486, 998);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(0, 800);
      ctx.lineTo(512, 800);
      ctx.stroke();
    },
    1,
  );
}

/** Un panneau de fusuma : papier crème, cadre laqué, poignée ronde, branche de pin à l'encre. */
export function fusumaTexture(mirror: boolean): THREE.CanvasTexture {
  return make(
    512,
    1024,
    (ctx, rnd) => {
      ctx.fillStyle = '#efe5c9';
      ctx.fillRect(0, 0, 512, 1024);
      if (mirror) {
        ctx.translate(512, 0);
        ctx.scale(-1, 1);
      }
      // Brume dorée en bas, façon paravent.
      const mist = ctx.createLinearGradient(0, 620, 0, 1024);
      mist.addColorStop(0, 'rgba(201,161,90,0)');
      mist.addColorStop(1, 'rgba(201,161,90,0.38)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 620, 512, 404);
      // Branche de pin : un trait qui serpente, et des touffes d'aiguilles.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-10, 300);
      ctx.bezierCurveTo(120, 260, 190, 360, 300, 330);
      ctx.bezierCurveTo(380, 310, 420, 250, 470, 262);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(190, 330);
      ctx.bezierCurveTo(230, 400, 280, 430, 340, 440);
      ctx.stroke();
      for (const [cx, cy] of [
        [110, 262],
        [215, 300],
        [305, 300],
        [395, 258],
        [455, 240],
        [285, 418],
        [345, 430],
      ]) {
        ctx.strokeStyle = 'rgba(38,70,52,0.85)';
        ctx.lineWidth = 2.2;
        for (let k = 0; k < 15; k++) {
          const a = -Math.PI * (0.12 + (k / 14) * 0.76);
          const len = 30 + rnd() * 16;
          ctx.beginPath();
          ctx.moveTo(cx as number, cy as number);
          ctx.lineTo((cx as number) + Math.cos(a) * len, (cy as number) + Math.sin(a) * len);
          ctx.stroke();
        }
      }
      if (mirror) ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Cadre laqué et poignée.
      ctx.strokeStyle = '#17130f';
      ctx.lineWidth = 22;
      ctx.strokeRect(11, 11, 490, 1002);
      ctx.fillStyle = '#17130f';
      ctx.beginPath();
      ctx.arc(mirror ? 452 : 60, 560, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9a15a';
      ctx.beginPath();
      ctx.arc(mirror ? 452 : 60, 560, 9, 0, Math.PI * 2);
      ctx.fill();
    },
    1853,
  );
}

/** Mur d'argile (juraku) : ocre clair, légèrement moucheté. */
export function wallTexture(): THREE.CanvasTexture {
  const t = make(
    256,
    256,
    (ctx, rnd) => {
      ctx.fillStyle = '#dccba0';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(120,96,52,0.10)' : 'rgba(255,246,214,0.14)';
        ctx.fillRect(rnd() * 256, rnd() * 256, 1.6, 1.6);
      }
    },
    7,
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Rouleau suspendu (kakejiku) : montagnes dans la brume à l'encre, un sceau vermillon, et la
 * monture de soie. Peinture originale.
 */
export function scrollTexture(): THREE.CanvasTexture {
  return make(
    384,
    1152,
    (ctx, rnd) => {
      // Monture.
      ctx.fillStyle = '#6f7d6a';
      ctx.fillRect(0, 0, 384, 1152);
      ctx.fillStyle = '#c9b27a';
      ctx.fillRect(0, 150, 384, 28);
      ctx.fillRect(0, 938, 384, 28);
      // Papier.
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(34, 178, 316, 760);
      // Trois plans de montagnes, du plus pâle au plus sombre.
      const ridge = (base: number, height: number, alpha: number, seedShift: number): void => {
        ctx.fillStyle = `rgba(23,19,15,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(34, base);
        for (let x = 34; x <= 350; x += 8) {
          const u = (x - 34) / 316;
          const y =
            base -
            height *
              (0.55 + 0.45 * Math.sin(u * 5.2 + seedShift)) *
              (0.75 + 0.25 * Math.sin(u * 17 + seedShift * 3)) -
            rnd() * 5;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(350, base + 90);
        ctx.lineTo(34, base + 90);
        ctx.closePath();
        ctx.fill();
        // La brume efface le pied de la montagne.
        const fog = ctx.createLinearGradient(0, base - 10, 0, base + 90);
        fog.addColorStop(0, 'rgba(244,236,216,0)');
        fog.addColorStop(1, 'rgba(244,236,216,1)');
        ctx.fillStyle = fog;
        ctx.fillRect(34, base - 10, 316, 100);
      };
      ridge(470, 150, 0.16, 0.6);
      ridge(600, 190, 0.34, 2.1);
      ridge(760, 170, 0.72, 4.0);
      // Un pin au premier plan.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(250, 900);
      ctx.bezierCurveTo(240, 830, 268, 770, 250, 700);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      for (const [cx, cy] of [
        [228, 720],
        [276, 742],
        [240, 786],
      ]) {
        for (let k = 0; k < 13; k++) {
          const a = -Math.PI * (0.1 + (k / 12) * 0.8);
          ctx.beginPath();
          ctx.moveTo(cx as number, cy as number);
          ctx.lineTo((cx as number) + Math.cos(a) * 34, (cy as number) + Math.sin(a) * 30);
          ctx.stroke();
        }
      }
      // Sceau.
      ctx.fillStyle = '#c8402a';
      ctx.fillRect(76, 852, 34, 34);
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 3;
      ctx.strokeRect(84, 860, 18, 18);
      // Bâtons du rouleau.
      ctx.fillStyle = '#2b1c12';
      ctx.fillRect(0, 0, 384, 16);
      ctx.fillRect(0, 1130, 384, 22);
    },
    1846,
  );
}

/** Papier d'une lampe (andon) : chaud, avec les montants de son cadre. */
export function lanternTexture(): THREE.CanvasTexture {
  return make(
    128,
    256,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#fff3cf');
      g.addColorStop(0.6, '#ffd98a');
      g.addColorStop(1, '#f2b45a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 256);
      ctx.strokeStyle = '#2b1c12';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 116, 244);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(64, 6);
      ctx.lineTo(64, 250);
      ctx.moveTo(6, 128);
      ctx.lineTo(122, 128);
      ctx.stroke();
    },
    3,
  );
}
