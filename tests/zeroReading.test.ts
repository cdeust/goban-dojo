import { expect, test, vi } from 'vitest';
import { PASS, POINTS } from '../src/domain/board.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { searchZero } from '../src/engine/zeroSearch.ts';
import {
  extendZeroLine,
  previewZeroLines,
  readZeroLine,
  type ZeroReadingStep,
} from '../src/state/zeroReading.ts';

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
  const lines = await previewZeroLines(search, root, new AbortController().signal, onLine, {
    branches: 3,
  });
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
  const lines = await previewZeroLines(search, root, new AbortController().signal, vi.fn(), {
    branches: 3,
  });
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

test('élargir conserve les branches existantes et les candidats naturels non encore affichés', async () => {
  const signal = new AbortController().signal;
  const search = vi.fn(async () => ({
    visits: 6,
    choices: [10, 11, 12, 13, 14, 15].map((point) => ({
      point,
      line: [point, PASS, PASS],
      visits: 1,
      blackWin: 0.6,
    })),
  }));
  const initial = await previewZeroLines(search, root, signal, vi.fn(), { branches: 3 });
  const update = vi.fn();
  const more = await previewZeroLines(search, root, signal, update, {
    existing: initial,
    branches: 6,
  });
  expect(search).toHaveBeenCalledTimes(1);
  expect(more.map((line) => line.moves[0]!.point)).toEqual([10, 11, 12, 13, 14, 15]);
  expect(more[0]).toBe(initial[0]);
  expect(update.mock.calls.map(([, index]) => index)).toEqual([3, 4, 5]);
  expect(more.every((line) => line.excluded?.length === 0)).toBe(true);
});

test('approfondir utilise le reste de la variante puis recherche à sa feuille sans modifier le préfixe', async () => {
  const signal = new AbortController().signal;
  const search = vi.fn(async (pos: EnginePosition) =>
    pos === root ? result(7, [7, 8, 9, 10]) : result(11, [11, 12, PASS, PASS]),
  );
  const [initial] = await previewZeroLines(search, root, signal, vi.fn(), {
    branches: 1,
    depth: 2,
  });
  const update = vi.fn();
  const deep = await extendZeroLine(search, root, initial!, 8, signal, update);
  expect(search).toHaveBeenCalledTimes(2);
  expect(search.mock.calls[1]![0].moves.map((move) => move.point)).toEqual([7, 8, 9, 10]);
  expect(initial!.moves.map((move) => move.point)).toEqual([7, 8]);
  expect(deep.moves.map((move) => move.point)).toEqual([7, 8, 9, 10, 11, 12, PASS, PASS]);
  expect(deep.blackWin).toBe(initial!.blackWin);
  expect(deep.complete).toBe(true);
  expect(update.mock.calls.map(([line]) => line.moves.length)).toEqual([4, 8]);
  await expect(extendZeroLine(search, root, deep, 60, signal, vi.fn())).resolves.toBe(deep);
  expect(search).toHaveBeenCalledTimes(2);
});

test('une extension interrompue conserve le dernier préfixe publié et oublie les sorties tardives', async () => {
  const controller = new AbortController();
  const signal = controller.signal;
  const initial = { moves: [{ color: 'B' as const, point: 0 }], blackWin: 0.5 };
  const search = vi.fn(async (position: EnginePosition) => {
    if (position.moves.length > 1) controller.abort();
    return result(2, [2, 3]);
  });
  const onUpdate = vi.fn();
  const partial = await extendZeroLine(search, root, initial, 8, signal, onUpdate);
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(partial.moves.map((m) => m.point)).toEqual([0, 2, 3]);
});

test('plus de cent alternatives demandées conservent des premiers coups distincts et arrêtent la recherche aux choix légaux disponibles', async () => {
  const points = Array.from({ length: 120 }, (_, i) => i);
  const search = vi.fn(
    async (
      _position: EnginePosition,
      { exclude = [] }: { signal: AbortSignal; exclude?: number[] },
    ) => {
      const point = points.find((p) => !exclude.includes(p));
      return point === undefined ? { visits: 0, choices: [] } : result(point, [point, PASS, PASS]);
    },
  );
  const signal = new AbortController().signal;
  const initial = await previewZeroLines(search, root, signal, vi.fn(), { branches: 12 });
  const resultLines = await previewZeroLines(search, root, signal, vi.fn(), {
    branches: POINTS + 1,
    existing: initial,
  });
  expect(resultLines.map((line) => line.moves[0]!.point)).toEqual(points);
  expect(resultLines[12]!.excluded).toEqual(points.slice(0, 12));
  expect(search).toHaveBeenCalledTimes(121);
});

test('la lecture par défaut calcule dix premiers coups distincts et vingt coups par suite', async () => {
  const search = vi.fn(async () => ({
    visits: 32,
    choices: Array.from({ length: 10 }, (_, i) => ({
      point: i,
      visits: 1,
      blackWin: 0.5,
      line: [i, ...Array.from({ length: 20 }, (_, j) => 40 + j)],
    })),
  }));
  const lines = await previewZeroLines(search, root, new AbortController().signal, vi.fn());
  expect(search).toHaveBeenCalledTimes(1);
  expect(lines).toHaveLength(10);
  expect(new Set(lines.map(({ moves }) => moves[0]!.point)).size).toBe(10);
  for (const { moves } of lines) {
    expect(moves).toHaveLength(20);
    expect(moves.at(-1)).toEqual({ point: 58, color: 'W' });
  }
});
