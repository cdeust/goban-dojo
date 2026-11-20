import { expect, test, vi } from 'vitest';
import { PASS } from '../src/domain/board.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { previewZeroLines, readZeroLine, type ZeroReadingStep } from '../src/state/zeroReading.ts';

const root: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
const result = (point: number, line = [point]) => ({
  visits: 32,
  choices: [{ point, visits: 32, blackWin: 0.55, line }],
});

test('la lecture relance 60 recherches successives avec le budget choisi', async () => {
  const line: ZeroReadingStep[] = [];
  const search = vi.fn(async (position: EnginePosition) => result(position.moves.length));
  const signal = new AbortController().signal;
  await readZeroLine(search, root, {
    first: 80,
    limit: 60,
    visits: 128,
    signal,
    onStep: (step) => line.push(step),
  });
  expect(search).toHaveBeenCalledTimes(60);
  expect(search).toHaveBeenNthCalledWith(
    2,
    {
      ...root,
      next: 'W',
      moves: [{ color: 'B', point: 80 }],
    },
    { signal, visits: 128 },
  );
  expect(line).toHaveLength(60);
  expect(line[0]?.blackWin).toBeUndefined();
  expect(line[1]?.blackWin).toBe(0.55);
  expect(line.at(-1)?.move.color).toBe('W');
});

test('une seconde passe termine la lecture même si le budget permet de continuer', async () => {
  const search = vi.fn(async () => result(PASS));
  const onStep = vi.fn();
  await readZeroLine(search, root, { limit: 60, signal: new AbortController().signal, onStep });
  expect(search).toHaveBeenCalledTimes(2);
  expect(onStep).toHaveBeenCalledTimes(2);
});

test('quitter la position pendant la recherche empêche toute projection tardive', async () => {
  const controller = new AbortController();
  const onStep = vi.fn();
  const search = vi.fn(async () => {
    controller.abort();
    return result(19);
  });
  await readZeroLine(search, root, { limit: 60, signal: controller.signal, onStep });
  expect(onStep).not.toHaveBeenCalled();
  const previewSearch = vi.fn(async () => result(19));
  expect(await previewZeroLines(previewSearch, root, controller.signal, onStep)).toEqual([]);
  expect(previewSearch).not.toHaveBeenCalled();
});

test('les aperçus prolongent les feuilles de leur branche, alternent les couleurs et gardent la valeur du premier coup', async () => {
  const onLine = vi.fn();
  const search = vi.fn(async (position: EnginePosition) => {
    if (position.moves.length === 0) {
      return {
        visits: 32,
        choices: [
          { point: 15, line: [15, 36, 51], visits: 24, blackWin: 0.6 },
          { point: 16, line: [16], visits: 8, blackWin: 0.4 },
        ],
      };
    }
    return result(PASS, [PASS, PASS]);
  });
  const preview = await previewZeroLines(search, root, new AbortController().signal, onLine);
  expect(onLine.mock.calls.map(([, index]) => index)).toEqual([0, 0, 1, 1]);
  expect(onLine.mock.calls[0]?.[0].moves).toHaveLength(3);
  expect(preview.map((line) => line.blackWin)).toEqual([0.6, 0.4]);
  expect(preview[0]?.moves.map((move) => move.point)).toEqual([15, 36, 51, PASS, PASS]);
  expect(preview[1]?.moves).toEqual([
    { color: 'B', point: 16 },
    { color: 'W', point: PASS },
    { color: 'B', point: PASS },
  ]);
  expect(search.mock.calls[2]?.[0].moves).toEqual([{ color: 'B', point: 16 }]);
});
