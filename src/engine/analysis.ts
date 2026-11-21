import { PASS, opposite } from '../domain/board.ts';
import { rankedLegalPoints, type Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';

/** Deux niveaux de douze options donnent jusqu’à 144 suites à comparer. */
export const ANALYSIS_WIDTH = 12;

export interface Candidate {
  point: number;
  rank: number;
  prior: number;
  recorded: boolean;
}

export function candidatesOf(
  position: EnginePosition,
  policy: Evaluation['policy'],
  recorded?: number,
): Candidate[] {
  const { moves } = position;
  if (moves.at(-1)?.point === PASS && moves.at(-2)?.point === PASS) return [];
  const prior = (point: number) => (point === PASS ? policy.at(-1) : policy[point]) ?? 0;
  const ranked = rankedLegalPoints(policy);
  const shortlist = ranked.slice(0, ANALYSIS_WIDTH);
  if (recorded !== undefined && prior(recorded) > 0 && !shortlist.includes(recorded)) {
    shortlist[ANALYSIS_WIDTH - 1] = recorded;
  }
  return shortlist.map((point) => ({
    point,
    rank: ranked.indexOf(point) + 1,
    prior: prior(point),
    recorded: point === recorded,
  }));
}

export function afterCandidate(position: EnginePosition, point: number): EnginePosition {
  return {
    ...position,
    moves: [...position.moves, { color: position.next, point }],
    next: opposite(position.next),
  };
}
