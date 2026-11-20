import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { expect, it } from 'vitest';
import { POINTS, SIZE, type Color } from '../src/domain/board.ts';
import { boardAt, decodeMoves } from '../src/domain/game.ts';
import { ZERO_MODEL } from '../src/engine/zeroModel.ts';
import { encodeZeroPosition } from '../src/engine/zeroSearch.ts';

interface NativeHeatmap {
  moves: string;
  next: Color;
  winrate: number;
  policyPermille: Record<string, number>;
}

it('reproduit la politique et la valeur de Leela Zero 0.17 avec le modèle et l’encodeur livrés', async () => {
  const bytes = readFileSync(join(import.meta.dirname, '../public', ZERO_MODEL.file));
  expect(bytes.length).toBe(ZERO_MODEL.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(ZERO_MODEL.sha256);
  const reference: NativeHeatmap[] = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures/leela-zero-native.json'), 'utf8'),
  );
  expect(reference).toHaveLength(5);
  expect(reference.some((ref) => (ref.policyPermille[POINTS] ?? 0) > 0)).toBe(true);
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ['wasm'],
  });
  try {
    for (const ref of reference) {
      const moves = decodeMoves(ref.moves);
      const board = boardAt([], moves, moves.length);
      const planes = encodeZeroPosition({ setupBlack: [], moves, next: ref.next });
      const outputs = await session.run({
        board: new ort.Tensor('float32', planes, [1, 18, SIZE, SIZE]),
      });
      const policy = outputs.policy!.data as Float32Array;
      const value = outputs.value!.data as Float32Array;
      const maximum = Math.max(...policy);
      const exp = Array.from(policy, (logit) => Math.exp(logit - maximum));
      const sum = exp.reduce((a, b) => a + b);
      expect((1 + value[0]!) / 2).toBeCloseTo(ref.winrate, 5);
      for (let point = 0; point <= POINTS; point++) {
        // The native text heatmap hides occupied points and truncates probabilities to 1‰.
        if (point < POINTS && board.get(point)) continue;
        const nativeIndex =
          point === POINTS ? POINTS : (SIZE - 1 - Math.floor(point / SIZE)) * SIZE + (point % SIZE);
        const actual = Math.floor((1000 * exp[nativeIndex]!) / sum);
        expect(actual, `coup ${moves.length}, point ${point}`).toBe(ref.policyPermille[point] ?? 0);
      }
    }
  } finally {
    await session.release();
  }
});
