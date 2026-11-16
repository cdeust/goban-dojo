import { Board, PASS, pointFromSgf, type Color, type IllegalReason } from './board.ts';

/** Partie telle que servie à l'application (public/data/games.json). */
export interface GameRecord {
  id: string;
  /** Date ISO (AAAA-MM-JJ) telle qu'enregistrée dans la source ; sert au tri chronologique. */
  date: string;
  /** Date brute de la source quand elle porte plus d'information (plusieurs séances, ère japonaise). */
  dateRaw?: string;
  /** true si la date de la source est incompatible avec la biographie de Shūsaku. */
  dateSuspect?: boolean;
  black: string;
  white: string;
  blackRank?: string;
  whiteRank?: string;
  /** Couleur jouée par Shūsaku. */
  shusaku: Color;
  /** Nom porté par Shūsaku dans le kifu (Kuwahara, Yasuda ou Honinbo Shusaku). */
  shusakuName: string;
  opponent: string;
  handicap: number;
  /** Pierres de handicap, coordonnées SGF concaténées (« ddpdpp… »). */
  setupBlack: string;
  /** Coups : triplets couleur + coordonnée (« bqd », « wdc »), « b-- » pour une passe. */
  moves: string;
  result: GameResult;
  event?: string;
  place?: string;
  note?: string;
  /** Chemins d'origine dans le jeu de données source (plusieurs si doublons fusionnés). */
  sources: string[];
}

export interface GameResult {
  winner: 'B' | 'W' | 'jigo' | 'unfinished' | 'unknown';
  /** Écart en points ; absent pour un abandon ou un écart non précisé. */
  margin?: number;
  resign?: boolean;
  /** Précision de la source, traduite (« suite des coups inconnue », etc.). */
  note?: string;
  raw: string;
}

export interface Dataset {
  generatedFrom: { repository: string; commit: string; files: number };
  games: GameRecord[];
}

export interface Move {
  color: Color;
  point: number;
}

export function decodeMoves(encoded: string): Move[] {
  const out: Move[] = [];
  for (let i = 0; i + 3 <= encoded.length; i += 3) {
    const c = encoded.charAt(i);
    const coord = encoded.slice(i + 1, i + 3);
    out.push({ color: c === 'b' ? 'B' : 'W', point: coord === '--' ? PASS : pointFromSgf(coord) });
  }
  return out;
}

export function decodePoints(encoded: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 <= encoded.length; i += 2) out.push(pointFromSgf(encoded.slice(i, i + 2)));
  return out;
}

/**
 * Une pierre physique : posée au coup `placedAt` (0 = pierre de handicap),
 * éventuellement capturée au coup `capturedAt`.
 */
export interface StoneLife {
  color: Color;
  point: number;
  placedAt: number;
  capturedAt: number;
  /** Rang de la pierre parmi celles de sa couleur (index d'instance). */
  slot: number;
}

export interface Timeline {
  moves: Move[];
  stones: StoneLife[];
  /** stoneOfMove[n] = index dans `stones` de la pierre posée au coup n (1-indexé), -1 pour une passe. */
  stoneOfMove: Int32Array;
  /** capturesAt[n] = index des pierres capturées par le coup n. */
  capturesAt: number[][];
  illegal: { move: number; reason: IllegalReason }[];
  counts: { B: number; W: number };
}

export const NEVER = Number.POSITIVE_INFINITY;

/** Rejoue la partie entière et en déduit la vie de chaque pierre. */
export function buildTimeline(setupBlack: number[], moves: Move[]): Timeline {
  const board = new Board();
  const stones: StoneLife[] = [];
  const at = new Int32Array(361).fill(-1);
  const counts = { B: 0, W: 0 };
  const illegal: Timeline['illegal'] = [];
  const stoneOfMove = new Int32Array(moves.length + 1).fill(-1);
  const capturesAt: number[][] = [[]];

  const add = (color: Color, point: number, placedAt: number): number => {
    const idx = stones.length;
    stones.push({ color, point, placedAt, capturedAt: NEVER, slot: counts[color]++ });
    at[point] = idx;
    return idx;
  };

  for (const p of setupBlack) {
    board.setup(p, 'B');
    add('B', p, 0);
  }

  moves.forEach((mv, i) => {
    const n = i + 1;
    const captured: number[] = [];
    if (mv.point !== PASS) {
      const previous = at[mv.point] as number;
      const res = board.play(mv.color, mv.point);
      if (res.illegal) illegal.push({ move: n, reason: res.illegal });
      // Coup sur un point occupé (kifu fautif) : la pierre précédente disparaît.
      if (previous !== -1) {
        (stones[previous] as StoneLife).capturedAt = n;
        captured.push(previous);
      }
      const idx = add(mv.color, mv.point, n);
      stoneOfMove[n] = idx;
      for (const q of res.captures) {
        const s = at[q] as number;
        if (s !== -1) {
          (stones[s] as StoneLife).capturedAt = n;
          captured.push(s);
          at[q] = -1;
        }
      }
      if (res.illegal === 'suicide') {
        // Le groupe suicidé a été retiré du goban par Board.play.
        for (let q = 0; q < 361; q++) {
          const s = at[q] as number;
          if (s !== -1 && board.get(q) === null) {
            (stones[s] as StoneLife).capturedAt = n;
            captured.push(s);
            at[q] = -1;
          }
        }
      }
    } else {
      board.play(mv.color, PASS);
    }
    capturesAt.push(captured);
  });

  return { moves, stones, stoneOfMove, capturesAt, illegal, counts };
}

/** Nombre de prisonniers faits par chaque camp après n coups. */
export function prisonersAt(t: Timeline, n: number): { B: number; W: number } {
  // « B » = prisonniers détenus par Noir (pierres blanches capturées).
  const out = { B: 0, W: 0 };
  for (const s of t.stones) {
    if (s.capturedAt <= n) out[s.color === 'B' ? 'W' : 'B']++;
  }
  return out;
}
