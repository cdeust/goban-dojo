import type { EnginePosition } from '../engine/features.ts';
import type { ZeroChoice, ZeroResult } from '../engine/zeroSearch.ts';

export type ReadingCandidate = Pick<ZeroChoice, 'point' | 'visits' | 'blackWin'>;
export interface AlternativeBatch {
  excluded: number;
  choices: ReadingCandidate[];
}
export interface ReadingAlternativesState {
  batches: AlternativeBatch[];
  exhausted: boolean;
}

export async function moreReadingAlternatives(
  search: (
    position: EnginePosition,
    options: { signal: AbortSignal; visits: number; exclude?: number[] },
  ) => Promise<ZeroResult>,
  position: EnginePosition,
  visits: number,
  signal: AbortSignal,
  known: number[],
  previous: ReadingAlternativesState,
): Promise<ReadingAlternativesState> {
  signal.throwIfAborted();
  if (previous.exhausted) return previous;
  const shown = new Set(known);
  for (const batch of previous.batches) for (const { point } of batch.choices) shown.add(point);
  const exclude = [...shown];
  const { choices } = await search(position, {
    signal,
    visits,
    ...(exclude.length ? { exclude } : {}),
  });
  signal.throwIfAborted();
  const fresh: ReadingCandidate[] = [];
  for (const { point, blackWin, visits: count } of choices) {
    if (shown.has(point)) continue;
    shown.add(point);
    fresh.push({ point, blackWin, visits: count });
  }
  return fresh.length
    ? {
        batches: [...previous.batches, { excluded: exclude.length, choices: fresh }],
        exhausted: false,
      }
    : { ...previous, exhausted: true };
}
