import { PASS } from '../domain/board.ts';
import { boardAt, threatOf, type Move, type Threat } from '../domain/game.ts';
import { afterCandidate, candidatesOf } from './analysis.ts';
import type { EnginePosition } from './features.ts';
import { CANDIDATES, type Evaluator } from './judge.ts';

export const READING_DEPTHS = [60, 120, 240] as const;

export interface ReadingChoice {
  point: number;
  blackLead: number;
}

export interface ReadingStep {
  move: Move;
  before: number;
  blackLead: number;
  beforeOwnership: Float32Array | undefined;
  ownership: Float32Array | undefined;
  choices: ReadingChoice[];
  threat: Threat;
  rescued: number[];
}

interface ReadingOptions {
  limit: number;
  first?: number;
  signal: AbortSignal;
  onStep: (step: ReadingStep) => void;
}

/** Compare les positions filles à chaque demi-coup, puis projette les deux camps en alternance. */
export async function readLine(
  evaluate: Evaluator,
  start: EnginePosition,
  { limit, first, signal, onStep }: ReadingOptions,
): Promise<void> {
  let position = start;
  if (
    signal.aborted ||
    (position.moves.at(-1)?.point === PASS && position.moves.at(-2)?.point === PASS)
  )
    return;
  let [evaluation] = await evaluate([position]);
  for (let i = 0; i < limit && !signal.aborted; i++) {
    if (!evaluation) throw new Error('Évaluation de position absente');
    const pointWanted = i === 0 ? first : undefined;
    const candidates = candidatesOf(position, evaluation.policy, pointWanted).filter(
      (candidate) => candidate.rank <= CANDIDATES || candidate.recorded,
    );
    if (candidates.length === 0) throw new Error('Aucun coup légal proposé');
    const children = candidates.map(({ point }) => afterCandidate(position, point));
    const results = await evaluate(children);
    if (signal.aborted) return;
    const choices = candidates.map(({ point }, index) => {
      const result = results[index];
      if (!result) throw new Error('Évaluation de réponse absente');
      return { point, blackLead: result.blackLead, evaluation: result, position: children[index]! };
    });
    const side = position.next === 'B' ? 1 : -1;
    choices.sort((a, b) => side * (b.blackLead - a.blackLead));
    const picked =
      pointWanted === undefined ? choices[0] : choices.find(({ point }) => point === pointWanted);
    if (!picked) throw new Error('Ce coup est indisponible dans cette position');
    const child = picked.position;
    const threat = threatOf(child.setupBlack, child.moves, child.moves.length);
    const previous = threatOf(position.setupBlack, position.moves, position.moves.length);
    const board =
      previous.atari.length > 0 ? boardAt(child.setupBlack, child.moves, child.moves.length) : null;
    const rescued = previous.atari.filter(
      (point) => board?.get(point) === position.next && board.libertyCount(point) > 1,
    );

    onStep({
      move: { color: position.next, point: picked.point },
      before: evaluation.blackLead,
      blackLead: picked.blackLead,
      beforeOwnership: evaluation.blackOwnership,
      ownership: picked.evaluation.blackOwnership,
      choices: choices.map(({ point, blackLead }) => ({ point, blackLead })),
      threat,
      rescued,
    });

    const previousPoint = position.moves.at(-1)?.point;
    if (picked.point === PASS && previousPoint === PASS) return;
    position = child;
    evaluation = picked.evaluation;
  }
}
