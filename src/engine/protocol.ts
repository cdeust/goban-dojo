import { PASS, POINTS } from '../domain/board.ts';
import type { Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';

/** Messages échangés entre la page et le fil d'exécution du moteur. */
export type EngineRequest =
  { type: 'load' } | { type: 'evaluate'; id: number; positions: EnginePosition[] };

export type EngineResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'evaluated'; id: number; evaluations: Evaluation[] }
  | { type: 'error'; id: number; message: string };

/** Valide les données structurées avant de les employer comme indices du goban. */
export function isEnginePosition(input: unknown): input is EnginePosition {
  if (
    !input ||
    typeof input !== 'object' ||
    !('next' in input) ||
    (input.next !== 'B' && input.next !== 'W')
  )
    return false;
  if (
    !('setupBlack' in input) ||
    !Array.isArray(input.setupBlack) ||
    input.setupBlack.length > POINTS ||
    !input.setupBlack.every(isIntersection)
  )
    return false;
  if ('komi' in input && input.komi !== undefined && !Number.isFinite(input.komi)) return false;
  return (
    'moves' in input &&
    Array.isArray(input.moves) &&
    input.moves.every(
      (move) =>
        move &&
        typeof move === 'object' &&
        (move.color === 'B' || move.color === 'W') &&
        (move.point === PASS || isIntersection(move.point)),
    )
  );
}

export function isIntersection(point: unknown): boolean {
  return typeof point === 'number' && Number.isInteger(point) && point >= 0 && point < POINTS;
}
