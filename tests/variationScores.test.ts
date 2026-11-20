import { describe, expect, it, vi } from 'vitest';
import { PASS, POINTS } from '../src/domain/board.ts';
import type { Evaluation } from '../src/engine/decode.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { scoreMoveKey, VariationScoreCache } from '../src/state/variationScores.ts';

const start: EnginePosition = { setupBlack: [60], moves: [], next: 'W', komi: 6.5 };
const signal = new AbortController().signal;

function result(blackLead: number, priors: number[] = []): Evaluation {
  const policy = new Float64Array(POINTS + 1);
  priors.forEach((point, i) => {
    policy[point === PASS ? POINTS : point] = 1 / (i + 1);
  });
  return { blackLead, policy, blackWinrate: 0.5 };
}

describe('score en points par position', () => {
  it('applique le komi du kifu et rapporte le delta du côté de la pierre jouée à chaque pas', async () => {
    const evaluate = vi.fn(async ([p]: EnginePosition[]) => [
      result([3, 1.5, 2][p!.moves.length]!),
    ]);
    const cache = new VariationScoreCache(start, evaluate);
    const white = scoreMoveKey({ color: 'W', point: 0 });
    const black = white + scoreMoveKey({ color: 'B', point: PASS });
    await cache.fill(['', white, black], signal);
    expect(cache.at('')).toEqual({ blackLead: 3, evenKomi: 9.5 });
    expect(cache.afterMove(white)).toEqual({ blackLead: 1.5, evenKomi: 8, gain: 1.5 });
    expect(cache.afterMove(black)).toEqual({ blackLead: 2, evenKomi: 8.5, gain: 0.5 });
    expect(evaluate.mock.calls.at(-1)?.[0][0]).toEqual({
      ...start,
      next: 'W',
      moves: [
        { color: 'W', point: 0 },
        { color: 'B', point: PASS },
      ],
    });
    expect(cache.afterMove('')).toBeUndefined();
  });

  it('sépare les racines de même historique avec un autre komi, y compris KM absent ou négatif', async () => {
    const evaluate = vi.fn(async ([p]: EnginePosition[]) => [result(-(p!.komi ?? 0) + 2)]);
    for (const komi of [6.5, -1.5, undefined]) {
      const cache = new VariationScoreCache({ ...start, komi }, evaluate);
      await cache.fill(['', '', ''], signal);
      await cache.fill([''], signal);
      expect(cache.at('')).toEqual({ blackLead: 2 - (komi ?? 0), evenKomi: 2 });
    }
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it('arrête les requêtes obsolètes et déduplique une position en cours lors d’un changement de branche', async () => {
    let finish!: (items: Evaluation[]) => void;
    const first = new Promise<Evaluation[]>((resolve) => {
      finish = resolve;
    });
    const evaluate = vi.fn(async ([p]: EnginePosition[]) =>
      p!.moves.length === 0 ? first : [result(2)],
    );
    const cache = new VariationScoreCache(start, evaluate);
    const discarded = new AbortController();
    const previous = cache.fill(['', 'waa', 'waabcc'], discarded.signal);
    discarded.abort();
    const current = cache.fill(['', 'wbb'], signal);
    const duplicate = cache.fill(['', 'wbb'], signal);
    expect(evaluate).toHaveBeenCalledTimes(1);
    finish([result(3)]);
    await Promise.all([previous, current, duplicate]);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(cache.afterMove('wbb')?.gain).toBe(1);
    expect(cache.at('waa')).toBeUndefined();
    expect(evaluate.mock.calls.every(([positions]) => positions.length === 1)).toBe(true);
  });

  it('compare chaque réponse à son propre parent et inclut la passe dans les suggestions', async () => {
    const evaluate = vi.fn(async ([p]: EnginePosition[]) => {
      const point = p!.moves[0]?.point;
      const blackAtParent = point === 0 ? 4 : 11;
      return [
        result(
          p!.moves.length === 2 ? 7 : blackAtParent,
          point === 0 ? [PASS, 1, 2, 3, 4, 5] : [6, PASS],
        ),
      ];
    });
    const cache = new VariationScoreCache(start, evaluate);
    await cache.fill(['', 'waa', 'waab--', 'wbb', 'wbbb--'], signal);
    expect(cache.suggested('waa')).toEqual([PASS, 1, 2, 3, 4]);
    expect(cache.suggested('wbb')).toEqual([6, PASS]);
    expect(cache.afterMove('waab--')?.gain).toBe(3);
    expect(cache.afterMove('wbbb--')?.gain).toBe(-4);
    expect(cache.suggested('wcc')).toBeUndefined();
  });

  it('conserve les scores valides quand une estimation échoue et permet de la redemander', async () => {
    const evaluate = vi
      .fn(async () => [result(3)])
      .mockResolvedValueOnce([result(1)])
      .mockResolvedValueOnce([result(NaN)]);
    const cache = new VariationScoreCache(start, evaluate);
    await cache.fill(['', 'waa'], signal);
    expect(cache.at('waa')).toBeUndefined();
    expect(cache.error('waa')).toBe('Avance estimée indisponible');
    expect(cache.at('')?.blackLead).toBe(1);
    await cache.fill(['waa'], signal);
    expect(evaluate).toHaveBeenCalledTimes(2);
    cache.clearErrors();
    await cache.fill(['', 'waa'], signal);
    expect(cache.afterMove('waa')?.gain).toBe(-2);
    expect(evaluate).toHaveBeenCalledTimes(3);
  });
});
