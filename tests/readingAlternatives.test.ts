import { expect, test, vi } from 'vitest';
import type { EnginePosition } from '../src/engine/features.ts';
import {
  moreReadingAlternatives,
  type ReadingAlternativesState,
} from '../src/state/readingAlternatives.ts';

const position: EnginePosition = { setupBlack: [], next: 'W', moves: [{ color: 'B', point: 200 }] };
const initial: ReadingAlternativesState = { batches: [], exhausted: false };
const candidate = (point: number, visits = 4) => ({ point, visits, blackWin: 0.75, line: [point] });

test('une recherche supplémentaire écarte les réponses présentées, dans la position et au budget choisis', async () => {
  const signal = new AbortController().signal;
  const search = vi
    .fn()
    .mockResolvedValueOnce({ choices: [candidate(1), candidate(7), candidate(7)], visits: 128 })
    .mockResolvedValueOnce({ choices: [candidate(3, 2)], visits: 128 })
    .mockResolvedValueOnce({ choices: [], visits: 0 });
  const first = await moreReadingAlternatives(search, position, 128, signal, [1], initial);
  const second = await moreReadingAlternatives(search, position, 128, signal, [1], first);
  expect(search).toHaveBeenNthCalledWith(2, position, { signal, visits: 128, exclude: [1, 7] });
  expect(second.batches).toEqual([
    { excluded: 1, choices: [{ point: 7, blackWin: 0.75, visits: 4 }] },
    { excluded: 2, choices: [{ point: 3, blackWin: 0.75, visits: 2 }] },
  ]);
  const done = await moreReadingAlternatives(search, position, 128, signal, [1], second);
  expect(done).toEqual({ ...second, exhausted: true });
  expect(await moreReadingAlternatives(search, position, 128, signal, [1], done)).toBe(done);
  expect(search).toHaveBeenCalledTimes(3);
});

test('la première recherche en bout de ligne reste libre et une demande périmée ne publie aucun choix', async () => {
  const c = new AbortController();
  const search = vi.fn(async () => ({ visits: 4, choices: [candidate(5)] }));
  const state = await moreReadingAlternatives(search, position, 32, c.signal, [], initial);
  expect(search).toHaveBeenCalledWith(position, { visits: 32, signal: c.signal });
  expect(state.batches[0]?.excluded).toBe(0);
  const late = vi.fn(async () => {
    c.abort();
    return { visits: 4, choices: [candidate(7)] };
  });
  await expect(
    moreReadingAlternatives(late, position, 32, c.signal, [], state),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(state.batches).toHaveLength(1);
});
