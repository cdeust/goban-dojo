/**
 * Encodage d'une position pour un réseau KataGo (entrées « V7 », modèles de version 8 à 17).
 *
 * Portage de `NNInputs::fillRowV7` (KataGo v1.18.2, cpp/neuralnet/nninputs.cpp, l. 2302 et suiv.)
 * et de la recherche de shicho `Board::searchIsLadderCaptured` (cpp/game/board.cpp, l. 1581 et
 * 1628). KataGo est sous licence MIT (© David J. Wu et contributeurs).
 *
 * Règles encodées : japonaises (ko simple, score au territoire, taxe de seki, suicide interdit),
 * goban 19×19, komi nul. Sous ces règles, les plans 7, 8 et 18 à 21 restent nuls.
 *
 * Limite connue : le cas particulier « double ko » de la recherche de shicho n'est pas porté.
 */
import type { Color } from '../domain/board.ts';
import type { Move } from '../domain/game.ts';

const N = 19;
export const AREA = N * N;
/** Index du coup « passe » dans la politique. */
export const PASS_INDEX = AREA;
export const SPATIAL_PLANES = 22;
export const GLOBAL_FEATURES = 19;

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
type Stone = typeof BLACK | typeof WHITE;
const other = (c: Stone): Stone => (c === BLACK ? WHITE : BLACK);
const stoneOf = (c: Color): Stone => (c === 'B' ? BLACK : WHITE);

const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: AREA }, (_, p) => {
  const x = p % N;
  const y = (p - x) / N;
  const r: number[] = [];
  if (x > 0) r.push(p - 1);
  if (x < N - 1) r.push(p + 1);
  if (y > 0) r.push(p - N);
  if (y < N - 1) r.push(p + N);
  return r;
});
const nb = (p: number): readonly number[] => NEIGHBOURS[p] as readonly number[];

interface Chain {
  stones: number[];
  libs: number[];
}

/** Goban minimal, aux conventions de KataGo (point de ko simple compris). */
class NetBoard {
  readonly c = new Uint8Array(AREA);
  ko = -1;

  clone(): NetBoard {
    const b = new NetBoard();
    b.c.set(this.c);
    b.ko = this.ko;
    return b;
  }

  chain(p: number): Chain {
    const col = this.c[p];
    const seen = new Uint8Array(AREA);
    const stones = [p];
    const libs: number[] = [];
    seen[p] = 1;
    for (let i = 0; i < stones.length; i++) {
      for (const q of nb(stones[i] as number)) {
        if (seen[q]) continue;
        seen[q] = 1;
        if (this.c[q] === col) stones.push(q);
        else if (this.c[q] === EMPTY) libs.push(q);
      }
    }
    return { stones, libs };
  }

  numLibs(p: number): number {
    return this.chain(p).libs.length;
  }

  isLegal(p: number, col: Stone): boolean {
    if (p === -1) return true;
    if (this.c[p] !== EMPTY || p === this.ko) return false;
    for (const q of nb(p)) if (this.c[q] === EMPTY) return true;
    for (const q of nb(p)) {
      const libs = this.numLibs(q);
      if (this.c[q] === col && libs > 1) return true;
      if (this.c[q] === other(col) && libs === 1) return true;
    }
    return false; // suicide
  }

  /** Joue un coup supposé légal ; fixe le point de ko comme `Board::playMoveAssumeLegal`. */
  play(p: number, col: Stone): void {
    this.ko = -1;
    if (p === -1) return;
    this.c[p] = col;
    let captured = 0;
    let last = -1;
    for (const q of nb(p)) {
      if (this.c[q] !== other(col)) continue;
      const ch = this.chain(q);
      if (ch.libs.length === 0) {
        for (const s of ch.stones) this.c[s] = EMPTY;
        captured += ch.stones.length;
        last = ch.stones[0] as number;
      }
    }
    if (captured === 1) {
      const me = this.chain(p);
      if (me.stones.length === 1 && me.libs.length === 1) this.ko = last;
    }
  }
}

/** Nombre maximal de positions visitées par recherche de shicho : au-delà, on conclut « non ». */
const LADDER_NODE_BUDGET = 25000;

/** La chaîne en `loc` est-elle capturée en shicho ? */
function ladderCaptured(start: NetBoard, loc: number, defenderFirst: boolean): boolean {
  const b = start.clone();
  const libs0 = b.numLibs(loc);
  if (libs0 > 2 || (defenderFirst && libs0 > 1)) return false;
  const defender = b.c[loc] as Stone;
  const attacker = other(defender);
  if (defenderFirst) b.ko = -1;
  let nodes = 0;
  let aborted = false;
  const maxDepth = Math.floor((AREA * 3) / 2);

  const search = (bd: NetBoard, isDefender: boolean, depth: number): boolean => {
    if (aborted) return false;
    if (depth >= maxDepth) return true;
    if (nodes >= LADDER_NODE_BUDGET) {
      aborted = true;
      return false;
    }
    const ch = bd.chain(loc);
    const libs = ch.libs.length;
    if (!isDefender && libs <= 1) return true;
    if (!isDefender && libs >= 3) return false;
    if (isDefender && libs >= 2) return false;
    if (isDefender && bd.ko !== -1) return false;
    let moves: number[] = [];
    if (isDefender) {
      // D'abord les captures qui donnent des libertés : chaînes adverses voisines en atari.
      const seen = new Set<number>();
      for (const s of ch.stones) {
        for (const q of nb(s)) {
          if (bd.c[q] !== attacker) continue;
          const oc = bd.chain(q);
          const only = oc.libs[0];
          if (oc.libs.length === 1 && only !== undefined && !seen.has(only)) {
            seen.add(only);
            moves.push(only);
          }
        }
      }
      for (const l of ch.libs) {
        if (seen.has(l)) moves = moves.filter((m) => m !== l);
        moves.push(l);
      }
    } else {
      moves = ch.libs.slice();
    }
    const player = isDefender ? defender : attacker;
    for (const m of moves) {
      if (!bd.isLegal(m, player)) continue;
      const next = bd.clone();
      next.play(m, player);
      nodes++;
      const r = search(next, !isDefender, depth + 1);
      if (aborted) return false;
      if (isDefender && !r) return false;
      if (!isDefender && r) return true;
    }
    return isDefender;
  };

  const result = search(b, defenderFirst, 0);
  return aborted ? false : result;
}

/** Chaîne à deux libertés : quels coups de l'attaquant la capturent en shicho ? */
function ladderWorkingMoves(board: NetBoard, loc: number): number[] {
  const ch = board.chain(loc);
  if (ch.libs.length !== 2) return [];
  const attacker = other(board.c[loc] as Stone);
  const working: number[] = [];
  for (const m of ch.libs) {
    if (!board.isLegal(m, attacker)) continue;
    const next = board.clone();
    next.play(m, attacker);
    if (ladderCaptured(next, loc, true)) working.push(m);
  }
  return working;
}

/** Appelle `f` pour chaque pierre prise (ou prenable) en shicho. Équivalent d'`iterLadders`. */
function iterLadders(board: NetBoard, f: (p: number, working: number[]) => void): void {
  const solved = new Map<number, boolean>();
  const keyOf = new Int32Array(AREA).fill(-1);
  for (let p = 0; p < AREA; p++) {
    if (board.c[p] === EMPTY) continue;
    if (keyOf[p] === -1) for (const s of board.chain(p).stones) keyOf[s] = p;
    const libs = board.numLibs(p);
    if (libs !== 1 && libs !== 2) continue;
    const k = keyOf[p] as number;
    const known = solved.get(k);
    if (known !== undefined) {
      if (known) f(p, []);
      continue;
    }
    const working = libs === 2 ? ladderWorkingMoves(board, p) : [];
    const laddered = libs === 1 ? ladderCaptured(board, p, true) : working.length > 0;
    solved.set(k, laddered);
    if (laddered) f(p, working);
  }
}

export interface EnginePosition {
  /** Pierres noires de handicap, posées avant le premier coup. */
  setupBlack: number[];
  moves: Move[];
  /** Joueur au trait. */
  next: Color;
}

export interface Encoded {
  spatial: Float32Array;
  global: Float32Array;
  /** Légalité de chacun des 361 points, puis de la passe (toujours légale). */
  legal: Uint8Array;
}

export function encodePosition(position: EnginePosition): Encoded {
  const boards = [new NetBoard()];
  for (const p of position.setupBlack) (boards[0] as NetBoard).c[p] = BLACK;
  const moves = position.moves.map((m) => ({ pla: stoneOf(m.color), pos: m.point }));
  for (const m of moves) {
    const b = (boards[boards.length - 1] as NetBoard).clone();
    b.play(m.pos, m.pla);
    boards.push(b);
  }
  const board = boards[boards.length - 1] as NetBoard;
  const pla = stoneOf(position.next);
  const opp = other(pla);
  const spatial = new Float32Array(SPATIAL_PLANES * AREA);
  const global = new Float32Array(GLOBAL_FEATURES);
  const set = (plane: number, p: number): void => {
    spatial[plane * AREA + p] = 1;
  };

  for (let p = 0; p < AREA; p++) {
    set(0, p);
    const s = board.c[p];
    if (s === pla) set(1, p);
    else if (s === opp) set(2, p);
    if (s !== EMPTY) {
      const l = board.numLibs(p);
      if (l >= 1 && l <= 3) set(2 + l, p);
    }
  }
  if (board.ko !== -1) set(6, board.ko);

  // Plans 9 à 13 : les cinq derniers coups, tant que les couleurs alternent comme attendu.
  let included = 0;
  const expected = [opp, pla, opp, pla, opp];
  for (let i = 0; i < 5; i++) {
    const m = moves[moves.length - 1 - i];
    if (!m || m.pla !== expected[i]) break;
    included = i + 1;
    if (m.pos === -1) global[i] = 1;
    else set(9 + i, m.pos);
  }

  // Plans 14 à 17 : shicho sur la position courante et les deux précédentes.
  iterLadders(board, (p, working) => {
    set(14, p);
    if (board.c[p] === opp && board.numLibs(p) > 1) for (const w of working) set(17, w);
  });
  const previous = included < 1 ? board : (boards[boards.length - 2] as NetBoard);
  iterLadders(previous, (p) => set(15, p));
  const beforePrevious = included < 2 ? previous : (boards[boards.length - 3] as NetBoard);
  iterLadders(beforePrevious, (p) => set(16, p));

  // En score au territoire, le komi vu par le réseau est décalé d'un point par pierre posée
  // (cpp/game/boardhistory.cpp, l. 364-378, 597 et 1115-1122) : +1 par pierre noire, −1 par blanche.
  let whiteBonus = position.setupBlack.length;
  for (const m of moves) if (m.pos !== -1) whiteBonus += m.pla === BLACK ? 1 : -1;
  global[5] = (pla === WHITE ? whiteBonus : -whiteBonus) / 20;
  global[9] = 1; // score au territoire
  global[10] = 1; // taxe de seki
  global[14] = moves.at(-1)?.pos === -1 ? 1 : 0; // une passe terminerait la phase

  const legal = new Uint8Array(AREA + 1);
  for (let p = 0; p < AREA; p++) legal[p] = board.isLegal(p, pla) ? 1 : 0;
  legal[PASS_INDEX] = 1;
  return { spatial, global, legal };
}

/**
 * Pierres du joueur au trait qui sont prises au piège : leur groupe est en atari et ne peut pas
 * s'échapper, même en jouant le premier (shicho qui fonctionne, ou capture immédiate).
 */
export function trappedStones(position: EnginePosition): number[] {
  const board = new NetBoard();
  for (const p of position.setupBlack) board.c[p] = BLACK;
  for (const m of position.moves) board.play(m.point, stoneOf(m.color));
  const pla = stoneOf(position.next);
  const out: number[] = [];
  const done = new Uint8Array(AREA);
  for (let p = 0; p < AREA; p++) {
    if (board.c[p] !== pla || done[p]) continue;
    const chain = board.chain(p);
    for (const s of chain.stones) done[s] = 1;
    if (chain.libs.length === 1 && ladderCaptured(board, p, true)) out.push(...chain.stones);
  }
  return out.sort((a, b) => a - b);
}
