import { expect, test, vi } from 'vitest';
import { PASS, POINTS } from '../src/domain/board.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { searchZero } from '../src/engine/zeroSearch.ts';
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

test('un premier coup dominant laisse voir les deux meilleures alternatives par recherches indépendantes', async () => {
  const infer = async (position: EnginePosition) => {
    const policy = new Float32Array(POINTS + 1).fill(-100);
    if (position.moves.length === 0) {
      policy[0] = 30;
      policy[1] = 20;
      policy[2] = 10;
    } else policy[POINTS] = 30;
    return { policy, value: 0 };
  };
  const search = vi.fn(
    (position: EnginePosition, options: { signal: AbortSignal; exclude?: number[] }) =>
      searchZero(position, infer, { ...options, visits: 1 }),
  );
  const onLine = vi.fn();
  const lines = await previewZeroLines(search, root, new AbortController().signal, onLine);
  const points = lines.map((line) => line.moves[0]!.point);
  expect(points).toEqual([342, 343, 344]);
  expect(lines.map((line) => line.excluded)).toEqual([[], [342], [342, 343]]);
  expect(lines.map((line) => line.moves.slice(1).map((move) => move.point))).toEqual([
    [PASS, PASS],
    [PASS, PASS],
    [PASS, PASS],
  ]);
  expect(
    search.mock.calls.filter(([position]) => position === root).map(([, opts]) => opts.exclude),
  ).toEqual([undefined, [342], [342, 343]]);
  expect(
    search.mock.calls
      .filter(([position]) => position !== root)
      .every(([, opts]) => opts.exclude === undefined),
  ).toBe(true);
  expect(onLine.mock.calls[0]?.[0].moves).toHaveLength(1);
});

test('trois branches naturelles ne nécessitent aucune exclusion', async () => {
  const search = vi.fn(async () => ({
    visits: 3,
    choices: [30, 60, 80].map((point) => ({
      point,
      visits: 1,
      line: [point, PASS, PASS],
      blackWin: 0.5,
    })),
  }));
  const lines = await previewZeroLines(search, root, new AbortController().signal, vi.fn());
  expect(search).toHaveBeenCalledTimes(1);
  expect(lines.map((line) => line.moves[0]!.point)).toEqual([30, 60, 80]);
  expect(lines.every((line) => line.excluded?.length === 0)).toBe(true);
});

test('une racine sans candidat termine la recherche, une annulation après une branche empêche les suivantes', async () => {
  const search = vi.fn(async () => ({ visits: 0, choices: [] }));
  const onLine = vi.fn();
  const end: EnginePosition = {
    ...root,
    moves: [
      { color: 'B', point: PASS },
      { color: 'W', point: PASS },
    ],
  };
  await expect(
    previewZeroLines(search, end, new AbortController().signal, onLine),
  ).resolves.toEqual([]);
  expect(onLine).not.toHaveBeenCalled();
  expect(search).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const onFirst = vi.fn(() => controller.abort());
  const pending = vi.fn(async () => result(9));
  expect(await previewZeroLines(pending, root, controller.signal, onFirst)).toEqual([]);
  expect(pending).toHaveBeenCalledTimes(1);
  expect(onFirst).toHaveBeenCalledTimes(1);
});

test('une recherche alternative interrompue peut repartir depuis la racine libre', async () => {
  const opts: (number[] | undefined)[] = [];
  const first = vi.fn(
    async (_position: EnginePosition, options: { signal: AbortSignal; exclude?: number[] }) => {
      opts.push(options.exclude);
      if (options.exclude) throw new Error('worker indisponible');
      return result(12, [12, PASS, PASS]);
    },
  );
  const signal = new AbortController().signal;
  await expect(previewZeroLines(first, root, signal, vi.fn())).rejects.toThrow(
    'worker indisponible',
  );
  const second = vi.fn(
    async (_position: EnginePosition, options: { signal: AbortSignal; exclude?: number[] }) => {
      opts.push(options.exclude);
      if (options.exclude) return { visits: 0, choices: [] };
      return result(12, [12, PASS, PASS]);
    },
  );
  const lines = await previewZeroLines(second, root, signal, vi.fn());
  expect(lines.map((line) => line.moves[0]!.point)).toEqual([12]);
  expect(opts).toEqual([undefined, [12], undefined, [12]]);
});
