import { Board, neighbours, opposite, PASS, POINTS, type Color } from './board.ts';
import type { Move } from './game.ts';

export const TRAINING_KOMI = 7.5;
export const TRAINING_VISITS = 32;
export const TRAINING_BUDGETS = [8, 32, 64] as const;
export type TrainingVisits = (typeof TRAINING_BUDGETS)[number];
export function validTrainingVisits(value: unknown): value is TrainingVisits {
  return TRAINING_BUDGETS.some((visits) => visits === value);
}
export type TrainingResult =
  | { kind: 'resign'; winner: Color }
  | { kind: 'score'; black: number; white: number; winner: Color | 'jigo' };
export interface TrainingGame {
  human: Color;
  visits: TrainingVisits;
  moves: Move[];
  result: TrainingResult | null;
  dead: number[];
  createdAt: string;
}
export type MoveRejection = 'occupied' | 'suicide' | 'ko' | 'superko' | 'invalid' | 'finished';
export function newTrainingGame(
  human: Color,
  createdAt: string,
  visits: TrainingVisits = TRAINING_VISITS,
): TrainingGame {
  return { human, visits, moves: [], result: null, dead: [], createdAt };
}
export function nextPlayer(game: TrainingGame): Color {
  return game.moves.length % 2 === 0 ? 'B' : 'W';
}
export function needsAdjudication(game: TrainingGame): boolean {
  return (
    !game.result &&
    game.moves.length >= 2 &&
    game.moves.at(-1)?.point === PASS &&
    game.moves.at(-2)?.point === PASS
  );
}
export function trainingPosition(moves: readonly Move[]) {
  const board = new Board();
  const seen = new Set([board.positionKey()]);
  const numbers = new Map<number, number>();
  for (const [i, move] of moves.entries()) {
    if (move.color !== (i % 2 === 0 ? 'B' : 'W') || !validPoint(move.point))
      throw new Error('Coup invalide');
    const played = board.play(move.color, move.point);
    if (played.illegal || (move.point !== PASS && seen.has(board.positionKey())))
      throw new Error('Position illégale');
    seen.add(board.positionKey());
    for (const p of played.captures) numbers.delete(p);
    if (move.point !== PASS) numbers.set(move.point, i + 1);
  }
  return { board, seen, numbers };
}
function validPoint(p: number): boolean {
  return Number.isInteger(p) && p >= PASS && p < POINTS;
}
export function tryTrainingMove(
  game: TrainingGame,
  point: number,
): { game: TrainingGame; error?: MoveRejection } {
  if (game.result || needsAdjudication(game)) return { game, error: 'finished' };
  if (!validPoint(point)) return { game, error: 'invalid' };
  const { board, seen } = trainingPosition(game.moves);
  const played = board.play(nextPlayer(game), point);
  if (played.illegal) return { game, error: played.illegal };
  if (point !== PASS && seen.has(board.positionKey())) return { game, error: 'superko' };
  return { game: { ...game, moves: [...game.moves, { color: nextPlayer(game), point }] } };
}
export function resignTraining(game: TrainingGame): TrainingGame {
  return game.result
    ? game
    : { ...game, result: { kind: 'resign', winner: opposite(game.human) }, dead: [] };
}
export function toggleDeadGroup(game: TrainingGame, point: number): TrainingGame {
  if (!needsAdjudication(game) || !validPoint(point) || point === PASS) return game;
  const group = trainingPosition(game.moves).board.stonesOf(point);
  if (!group.length) return game;
  const dead = new Set(game.dead);
  if (dead.has(point)) for (const p of group) dead.delete(p);
  else for (const p of group) dead.add(p);
  return { ...game, dead: [...dead].sort((a, b) => a - b) };
}
/** Chinese area scoring: stones + empty regions bounded by one color, white komi.
 * Dead groups are explicit user adjudications, not model predictions. */
export function areaScore(game: TrainingGame) {
  const { board } = trainingPosition(game.moves);
  for (const point of game.dead) board.setup(point, null);
  let black = 0;
  let white = TRAINING_KOMI;
  const visited = new Set<number>();
  for (let p = 0; p < POINTS; p++) {
    const color = board.get(p);
    if (color === 'B') {
      black++;
      continue;
    }
    if (color === 'W') {
      white++;
      continue;
    }
    if (visited.has(p)) continue;
    const boundary = new Set<Color>();
    const region = [p];
    visited.add(p);
    for (const q of region) {
      for (const n of neighbours(q)) {
        const surrounding = board.get(n);
        if (surrounding) boundary.add(surrounding);
        else if (!visited.has(n)) {
          visited.add(n);
          region.push(n);
        }
      }
    }
    if (boundary.size === 1 && boundary.has('B')) black += region.length;
    if (boundary.size === 1 && boundary.has('W')) white += region.length;
  }
  return {
    black,
    white,
    winner: black === white ? ('jigo' as const) : black > white ? ('B' as const) : ('W' as const),
  };
}
export function confirmTrainingScore(game: TrainingGame): TrainingGame {
  if (!needsAdjudication(game)) return game;
  return { ...game, result: { kind: 'score', ...areaScore(game) } };
}
