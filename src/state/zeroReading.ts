import { PASS } from '../domain/board.ts';
import { threatOf, type Move } from '../domain/game.ts';
import { afterCandidate } from '../engine/analysis.ts';
import type { EnginePosition } from '../engine/features.ts';
import { isLegalZeroMove, type ZeroResult } from '../engine/zeroSearch.ts';

type Search = (
  position: EnginePosition,
  options: { signal: AbortSignal; visits?: number; exclude?: number[] },
) => Promise<ZeroResult>;

export interface ZeroReadingStep {
  move: Move;
  blackWin?: number;
  choices: ZeroResult['choices'];
  threat: ReturnType<typeof threatOf>;
}

export interface SimulationLine {
  excluded?: number[];
  moves: Move[];
  blackWin?: number;
}

/** Chaque position fait l’objet d’une nouvelle recherche, y compris après une bifurcation. */
export async function readZeroLine(
  search: Search,
  start: EnginePosition,
  options: {
    limit: number;
    first?: number;
    visits?: number;
    signal: AbortSignal;
    onStep: (step: ZeroReadingStep) => void;
  },
) {
  let position = start;
  const { signal } = options;
  for (let i = 0; i < options.limit && !signal.aborted; i++) {
    const { choices } = await search(position, { signal, visits: options.visits });
    if (signal.aborted || !choices.length) return;
    const point = (i === 0 ? options.first : undefined) ?? choices[0]!.point;
    const selected = choices.find((choice) => choice.point === point);
    if (!selected && !isLegalZeroMove(position, point))
      throw new Error('Coup interdit dans cette position');
    const move = { color: position.next, point };
    const previous = position.moves.at(-1);
    position = afterCandidate(position, point);
    options.onStep({
      move,
      blackWin: selected?.blackWin,
      choices,
      threat: threatOf(position.setupBlack, position.moves, position.moves.length),
    });
    if (point === PASS && previous?.point === PASS) return;
  }
}

/** Rejoue les branches les plus visitées et prolonge leurs feuilles par une nouvelle recherche. */
export async function previewZeroLines(
  search: Search,
  start: EnginePosition,
  signal: AbortSignal,
  onLine: (line: SimulationLine, index: number) => void,
): Promise<SimulationLine[]> {
  if (signal.aborted) return [];
  const lines: SimulationLine[] = [];
  const shown = new Set<number>();
  while (lines.length < 3 && !signal.aborted) {
    const excluded = [...shown];
    const { choices } = await search(
      start,
      excluded.length ? { signal, exclude: excluded } : { signal },
    );
    for (const branch of choices) {
      if (signal.aborted) return [];
      if (shown.has(branch.point) || branch.line.length === 0) continue;
      const source = { blackWin: branch.blackWin, excluded };
      let position = start;
      const moves: Move[] = [];
      let continuation = branch.line;
      while (continuation.length > 0) {
        for (const point of continuation) {
          moves.push({ color: position.next, point });
          position = afterCandidate(position, point);
          if (moves.length === 8) break;
        }
        onLine({ ...source, moves: moves.slice() }, lines.length);
        if (signal.aborted) return [];
        if (
          moves.length === 8 ||
          (position.moves.at(-1)?.point === PASS && position.moves.at(-2)?.point === PASS)
        )
          break;
        continuation = (await search(position, { signal })).choices[0]?.line ?? [];
        if (signal.aborted) return [];
      }
      lines.push({ ...source, moves });
      shown.add(branch.point);
      if (lines.length === 3) break;
    }
    // Aucun nouveau premier coup légal n'a reçu de visite dans cette recherche.
    if (shown.size === excluded.length) break;
  }
  if (signal.aborted) return [];
  return lines;
}

const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export function blackWinLabel(blackWin: number): string {
  return `Chances de Noir · ${percent.format(blackWin)}`;
}
