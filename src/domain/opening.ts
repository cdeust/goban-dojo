/**
 * Reconnaissance de l'ouverture de Shūsaku (秀策流) dans une partie.
 *
 * Diagramme de référence (Wikipedia, « Shusaku opening ») : 1 R16, 2 D17, 3 Q3, 4 P17, 5 C4,
 * 6 R5, 7 Q15. Noir occupe trois coins par un komoku (point 3-4) aux coups 1, 3 et 5 ; quand
 * Blanc approche l'un de ces komoku par un saut de cavalier (P17 contre R16), Noir répond par le
 * kosumi : le point en diagonale de sa pierre, vers le centre (Q15).
 */
import { PASS, SIZE, type Color } from './board.ts';
import type { Move } from './game.ts';

export interface ShusakuOpening {
  /** Les coups 1, 3 et 5 sont trois komoku noirs dans trois coins. */
  fuseki: boolean;
  /** Numéro du coup où Noir joue le kosumi, s'il le joue dans l'ouverture. */
  kosumi?: number;
}

/** Le kosumi n'est cherché que dans l'ouverture. */
const OPENING_MOVES = 30;

interface Corner {
  /** Coin : 0 à 3. */
  corner: number;
  /** Distances aux deux bords du coin (1 = première ligne), en colonnes puis en lignes. */
  dx: number;
  dy: number;
}

function cornerOf(point: number): Corner {
  const x = point % SIZE;
  const y = Math.floor(point / SIZE);
  const right = x > SIZE / 2;
  const bottom = y > SIZE / 2;
  return {
    corner: (right ? 1 : 0) + (bottom ? 2 : 0),
    dx: right ? SIZE - x : x + 1,
    dy: bottom ? SIZE - y : y + 1,
  };
}

/** Point du coin `corner` situé à `dx` colonnes et `dy` lignes de ses bords. */
function pointIn(corner: number, dx: number, dy: number): number {
  const x = corner & 1 ? SIZE - dx : dx - 1;
  const y = corner & 2 ? SIZE - dy : dy - 1;
  return y * SIZE + x;
}

const isKomoku = (c: Corner): boolean => (c.dx === 3 && c.dy === 4) || (c.dx === 4 && c.dy === 3);

/** Cherche l'ouverture de Shūsaku dans une partie sans handicap. */
export function shusakuOpening(moves: Move[], handicap: number): ShusakuOpening {
  if (handicap > 0) return { fuseki: false };
  const first = [moves[0], moves[2], moves[4]];
  if (first.some((m) => !m || m.color !== 'B' || m.point === PASS)) return { fuseki: false };
  const corners = first.map((m) => cornerOf((m as Move).point));
  const fuseki = corners.every(isKomoku) && new Set(corners.map((c) => c.corner)).size === 3;
  if (!fuseki) return { fuseki };

  const stones = new Map<number, Color>();
  for (let n = 0; n < Math.min(moves.length, OPENING_MOVES); n++) {
    const move = moves[n] as Move;
    if (move.point === PASS) continue;
    if (move.color === 'B') {
      for (const k of corners) {
        // L'approche blanche vient sur la troisième ligne, à deux points du komoku vers le
        // centre (P17 contre R16) ; le kosumi est le point en diagonale, vers le centre (Q15).
        const approach = k.dx === 3 ? pointIn(k.corner, 5, 3) : pointIn(k.corner, 3, 5);
        const kosumi = pointIn(k.corner, k.dx + 1, k.dy + 1);
        const own = pointIn(k.corner, k.dx, k.dy);
        const approached = stones.get(approach) === 'W';
        if (move.point === kosumi && stones.get(own) === 'B' && approached) {
          return { fuseki, kosumi: n + 1 };
        }
      }
    }
    stones.set(move.point, move.color);
  }
  return { fuseki };
}
