import {
  Board,
  PASS,
  neighbours,
  opposite,
  pointFromSgf,
  type Color,
  type IllegalReason,
} from './board.ts';

/** Partie telle que servie à l'application (public/data/games.json). */
interface CommonGameRecord {
  /** Identifiant stable : « s » suivi du numéro de la partie dans la collection source. */
  id: string;
  /**
   * Date grégorienne du début de la partie : AAAA-MM-JJ, ou AAAA-MM, ou AAAA quand la source
   * ne connaît pas le jour ou le mois.
   */
  date: string;
  /** Toutes les séances, telles que la source les écrit, si la partie s'est jouée sur plusieurs jours. */
  sessions?: string;
  /** Date dans le calendrier japonais (ère, année, mois, jour), telle que la donne la source. */
  dateJapanese?: string;
  black: string;
  white: string;
  blackRank?: string;
  whiteRank?: string;
  handicap: number;
  komi?: number;
  /** Régime de handicap sans pierres, quand la source le précise (« josen », « sen-ai-sen »). */
  regime?: string;
  /** Pierres de handicap, coordonnées SGF concaténées (« ddpdpp… »). */
  setupBlack: string;
  /** Coups : triplets couleur + coordonnée (« bqd », « wdc »), « b-- » pour une passe. */
  moves: string;
  result: GameResult;
  event?: string;
  place?: string;
  note?: string;
  /** Provenance : « cwi:126 », et le cas échéant « pgd:<chemin> » pour le lieu et les circonstances. */
  sources: string[];
}

export interface HistoricalGameRecord extends CommonGameRecord {
  imported?: false;
  /** Couleur jouée par Shūsaku. */
  shusaku: Color;
  /** Nom porté par Shūsaku dans le kifu (Yasuda Eisai, Yasuda, Kuwahara ou Honinbo Shusaku). */
  shusakuName: string;
  opponent: string;
  /** Partie en consultation : Shūsaku joue au sein d'une équipe. */
  rengo?: boolean;
}

export interface ImportedGameRecord extends CommonGameRecord {
  imported: true;
  shusaku?: never;
  shusakuName?: never;
  opponent?: never;
  rengo?: never;
}

export type GameRecord = HistoricalGameRecord | ImportedGameRecord;

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
  generatedFrom: {
    cwi: { page: string; archiveSha256: string; files: number };
    pgd: { repository: string; commit: string; files: number };
  };
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

/** Goban après les `n` premiers coups. */
export function boardAt(setupBlack: number[], moves: Move[], n: number): Board {
  const board = new Board();
  for (const p of setupBlack) board.setup(p, 'B');
  for (let i = 0; i < n && i < moves.length; i++) {
    const m = moves[i] as Move;
    board.play(m.color, m.point);
  }
  return board;
}

/** Ce qu'un coup accomplit, au-delà de poser une pierre. */
export interface Threat {
  /** Pierres adverses que ce coup vient de mettre en atari (une seule liberté). */
  atari: number[];
  /** Nombre de pierres capturées par ce coup. */
  captured: number;
  /**
   * Pierres amies voisines que ce coup relie alors qu'elles appartenaient à des groupes
   * distincts (vide si le coup ne relie rien).
   */
  connects: number[];
}

/**
 * Effet du coup `n` : les groupes adverses voisins de la pierre posée qui n'ont plus qu'une
 * liberté, les pierres qu'elle capture, et les groupes amis qu'elle relie.
 */
export function threatOf(setupBlack: number[], moves: Move[], n: number): Threat {
  const move = moves[n - 1];
  if (!move || move.point === PASS) return { atari: [], captured: 0, connects: [] };
  const { atari, captures, connects } = playTacticalMove(boardAt(setupBlack, moves, n - 1), move);
  return { atari, captured: captures.length, connects };
}

function playTacticalMove(board: Board, move: Move) {
  // Avant de jouer : les pierres amies voisines, et le groupe de chacune.
  const adjacent = neighbours(move.point);
  const friends = adjacent.filter((q) => board.get(q) === move.color);
  const groups = new Set(friends.map((q) => Math.min(...board.stonesOf(q))));
  const connects = groups.size >= 2 ? [...friends].sort((a, b) => a - b) : [];
  const enemies = adjacent.filter(
    (q) => board.get(q) === opposite(move.color) && board.libertyCount(q) > 1,
  );

  const result = board.play(move.color, move.point);
  const atari = new Set<number>();
  for (const q of enemies) {
    if (board.get(q) === opposite(move.color) && board.libertyCount(q) === 1) {
      for (const s of board.stonesOf(q)) atari.add(s);
    }
  }
  return { ...result, atari: [...atari].sort((a, b) => a - b), connects };
}

export interface StudyMove {
  number: number;
  move: Move;
  captures: number[];
  atari: number[];
  connects: number[];
}

/** Index chronologique des effets tactiques observables en une seule relecture. */
export function studyMoves(setupBlack: number[], moves: Move[]): StudyMove[] {
  const board = boardAt(setupBlack, moves, 0);
  const index: StudyMove[] = [];
  moves.forEach((move, i) => {
    if (move.point === PASS) {
      board.play(move.color, PASS);
      return;
    }
    const { illegal, captures, atari, connects } = playTacticalMove(board, move);
    if (!illegal && (captures.length || atari.length || connects.length)) {
      index.push({ number: i + 1, move, captures, atari, connects });
    }
  });
  return index;
}

/** Toutes les pierres, des deux couleurs, dont le groupe n'a plus qu'une liberté. */
export function atariStones(board: Board): number[] {
  const out: number[] = [];
  for (let p = 0; p < 361; p++)
    if (board.get(p) !== null && board.libertyCount(p) === 1) out.push(p);
  return out;
}
