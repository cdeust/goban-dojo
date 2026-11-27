import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { expect, it } from 'vitest';
import { pointFromHuman, pointToHuman } from '../src/domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { ZERO_MODEL } from '../src/engine/zeroModel.ts';
import { encodeZeroPosition, searchZero } from '../src/engine/zeroSearch.ts';
import { FIRST_LESSON } from '../src/story/lessons.ts';

it('vérifie la capture de la leçon et la suite trouvée à 32 visites par Leela Zero', async () => {
  const { gameId, before } = FIRST_LESSON;
  const dir = join(import.meta.dirname, '../public');
  const { games } = JSON.parse(readFileSync(join(dir, 'data/games.json'), 'utf8')) as Dataset;
  const game = games.find((item) => item.id === gameId)!;
  const record = decodeMoves(game.moves);
  const setupBlack = decodePoints(game.setupBlack);
  const played = record.at(before)!;
  const anchor = record.slice(0, before);
  const board = boardAt(setupBlack, anchor, before);
  const stone = pointFromHuman('P13')!;
  expect(board.get(stone)).toBe('B');
  expect(board.libertyCount(stone)).toBe(1);
  expect([played.color, pointToHuman(played.point)]).toEqual(['W', 'O13']);
  expect(board.play(played.color, played.point).captures).toEqual([stone]);

  const bytes = readFileSync(join(dir, ZERO_MODEL.file));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(ZERO_MODEL.sha256);
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ['wasm'],
  });
  try {
    const result = await searchZero(
      { setupBlack, moves: anchor, next: played.color, komi: game.komi },
      async (entry) => {
        const board = new ort.Tensor('float32', encodeZeroPosition(entry), [1, 18, 19, 19]);
        const outputs = await session.run({ board });
        return {
          policy: outputs.policy!.data as Float32Array,
          value: (outputs.value!.data as Float32Array)[0]!,
        };
      },
      { visits: 32 },
    );
    const [first] = result.choices;
    const line = first?.line.slice(0, 3).map(pointToHuman);
    expect(first?.visits).toBe(32);
    expect(line).toEqual(['O13', 'R13', 'S10']);
    expect(line).toEqual(record.slice(before, before + 3).map(({ point }) => pointToHuman(point)));
  } finally {
    await session.release();
  }
}, 30_000);
