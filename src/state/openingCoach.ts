import { PASS } from '../domain/board.ts';
import { boardAt, type Move } from '../domain/game.ts';
import { shapeFacts, type ShapeFacts } from '../domain/openingShape.ts';
import { afterCandidate } from '../engine/analysis.ts';
import type { EnginePosition } from '../engine/features.ts';
import type { Evaluator } from '../engine/judge.ts';
import { isLegalZeroMove, type ZeroResult } from '../engine/zeroSearch.ts';

export const COACH_PLIES = 5;
export const COACH_VISITS = 32;
export interface CoachStep {
  move: Move;
  facts: ShapeFacts;
  opponentFacts: ShapeFacts;
  /** Libertés du groupe du premier coup s'il est toujours sur le goban. */
  firstGroupLiberties: number | null;
}
export interface CoachLine {
  first: number;
  steps: CoachStep[];
  estimatedLead: number;
}
export interface CoachComparison {
  initial: ShapeFacts;
  lines: [CoachLine, CoachLine];
  equalHorizon: boolean;
}
type Search = (
  position: EnginePosition,
  options: { visits: number; signal: AbortSignal },
) => Promise<ZeroResult>;

/** Même position, même nombre maximal de demi-coups, même budget de recherche. Chaque coup est
 * contrôlé avant d'être appliqué (y compris le superko positionnel).
 */
export async function compareOpeningLines(
  search: Search,
  evaluate: Evaluator,
  start: EnginePosition,
  first: [number, number],
  signal: AbortSignal,
): Promise<CoachComparison> {
  signal.throwIfAborted();
  if (first[0] === first[1] || first.some((point) => !isLegalZeroMove(start, point)))
    throw new Error('Deux premiers coups légaux et distincts sont nécessaires.');
  const mover = start.next;
  const opponent = mover === 'B' ? 'W' : 'B';
  const initial = shapeFacts(boardAt(start.setupBlack, start.moves, start.moves.length), mover);
  const continuations: { first: number; steps: CoachStep[]; position: EnginePosition }[] = [];
  for (const candidate of first) {
    let position = start;
    const steps: CoachStep[] = [];
    let firstAlive = candidate !== PASS;
    for (let i = 0; i < COACH_PLIES; i++) {
      signal.throwIfAborted();
      let point = candidate;
      if (i > 0) {
        const result = await search(position, { visits: COACH_VISITS, signal });
        signal.throwIfAborted();
        if (result.visits !== COACH_VISITS) throw new Error('Budget de recherche incomplet.');
        const choice = result.choices.find((item) => isLegalZeroMove(position, item.point));
        if (!choice) throw new Error('Aucune réponse légale proposée.');
        point = choice.point;
      }
      if (!isLegalZeroMove(position, point)) throw new Error('Coup interdit dans la variante.');
      const move = { color: position.next, point };
      const previous = position.moves.at(-1)?.point;
      position = afterCandidate(position, point);
      const board = boardAt(position.setupBlack, position.moves, position.moves.length);
      firstAlive = firstAlive && board.get(candidate) === mover;
      steps.push({
        move,
        facts: shapeFacts(board, mover),
        opponentFacts: shapeFacts(board, opponent),
        firstGroupLiberties: firstAlive ? board.libertyCount(candidate) : null,
      });
      if (point === PASS && previous === PASS) break;
    }
    continuations.push({ first: candidate, steps, position });
  }
  signal.throwIfAborted();
  const evaluations = await evaluate(continuations.map((line) => line.position));
  signal.throwIfAborted();
  const [a, b] = continuations.map((line, i) => {
    const value = evaluations[i]?.blackLead;
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error('Évaluation manquante.');
    return {
      first: line.first,
      steps: line.steps,
      estimatedLead: (mover === 'B' ? 1 : -1) * value,
    };
  });
  return { initial, lines: [a!, b!], equalHorizon: a!.steps.length === b!.steps.length };
}
