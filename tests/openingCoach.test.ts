import { describe, expect, it, vi } from 'vitest';
import { Board, PASS, POINTS, pointFromHuman } from '../src/domain/board.ts';
import { boardAt } from '../src/domain/game.ts';
import { shapeFacts } from '../src/domain/openingShape.ts';
import { compareOpeningLines, COACH_PLIES, COACH_VISITS } from '../src/state/openingCoach.ts';
import { isLegalZeroMove } from '../src/engine/zeroSearch.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import type { Evaluation } from '../src/engine/decode.ts';

const p = (s: string) => pointFromHuman(s)!;
const empty: EnginePosition = { setupBlack: [], moves: [], next: 'B', komi: 6.5 };
const evaluate = async (positions: EnginePosition[]): Promise<Evaluation[]> =>
  positions.map((position) => ({
    policy: new Float64Array(POINTS + 1),
    blackLead: position.moves[0]?.point ?? 0,
    blackWinrate: 0.5,
  }));
const firstLegal = (position: EnginePosition) =>
  Array.from({ length: POINTS }, (_, n) => n).find((point) => isLegalZeroMove(position, point))!;
const search = async (position: EnginePosition, { visits }: { visits: number }) => {
  const point = firstLegal(position);
  return { visits, choices: [{ point, visits, blackWin: 0.5, line: [point] }] };
};

describe('Sensei : preuves de structure et comparaison de variantes', () => {
  it('compte les chaînes et libertés, pas un territoire ou une vie inventée', () => {
    const board = new Board();
    for (const stone of ['A1', 'B2', 'C2', 'Q16']) board.setup(p(stone), 'B');
    board.setup(p('A2'), 'W');
    expect(shapeFacts(board, 'B')).toEqual({
      stones: 4,
      chains: 3,
      atari: 1,
      twoLiberties: 0,
      occupiedCorners: 2,
    });
    expect(shapeFacts(board, 'W')).toEqual({
      stones: 1,
      chains: 1,
      atari: 1,
      twoLiberties: 0,
      occupiedCorners: 1,
    });
  });
  it('compare deux réponses distinctes avec le même budget et vérifie toutes les positions après chaque coup', async () => {
    const spy = vi.fn(search),
      judge = vi.fn(evaluate);
    const result = await compareOpeningLines(
      spy,
      judge,
      empty,
      [p('D4'), p('Q16')],
      new AbortController().signal,
    );
    expect(result.equalHorizon).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2 * (COACH_PLIES - 1));
    expect(spy.mock.calls.every(([, options]) => options.visits === COACH_VISITS)).toBe(true);
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0]![0].map((x) => x.moves.length)).toEqual([5, 5]);
    for (const line of result.lines) {
      expect(line.steps).toHaveLength(5);
      expect(line.steps[0]!.move.point).toBe(line.first);
      const moves = line.steps.map((step) => step.move);
      moves.forEach((move, i) => {
        const previous = { ...empty, moves: moves.slice(0, i), next: move.color };
        expect(isLegalZeroMove(previous, move.point)).toBe(true);
        const board = boardAt([], moves, i + 1);
        expect(line.steps[i]!.facts).toEqual(shapeFacts(board, 'B'));
        expect(line.steps[i]!.opponentFacts).toEqual(shapeFacts(board, 'W'));
      });
    }
  });
  it('refuse les premiers coups identiques, une réponse interdite et un budget incomplet, sans noter une branche invalide', async () => {
    const signal = new AbortController().signal;
    const judge = vi.fn(evaluate);
    await expect(
      compareOpeningLines(search, judge, empty, [p('D4'), p('D4')], signal),
    ).rejects.toThrow('distincts');
    await expect(
      compareOpeningLines(
        async () => ({
          visits: COACH_VISITS,
          choices: [{ point: p('D4'), visits: COACH_VISITS, blackWin: 0.5, line: [p('D4')] }],
        }),
        judge,
        empty,
        [p('D4'), p('Q16')],
        signal,
      ),
    ).rejects.toThrow('Aucune réponse légale');
    await expect(
      compareOpeningLines(
        async () => ({ visits: 1, choices: [] }),
        judge,
        empty,
        [p('D4'), p('Q16')],
        signal,
      ),
    ).rejects.toThrow('Budget');
    expect(judge).not.toHaveBeenCalled();
  });
  it('ne compare pas un horizon raccourci par deux passes et ne produit aucune mesure après annulation', async () => {
    const signal = new AbortController().signal;
    const passes = async (position: EnginePosition) => {
      const point = position.moves[0]?.point === p('D4') ? PASS : firstLegal(position);
      return {
        visits: COACH_VISITS,
        choices: [{ point, visits: COACH_VISITS, blackWin: 0.5, line: [point] }],
      };
    };
    const result = await compareOpeningLines(passes, evaluate, empty, [p('D4'), p('Q16')], signal);
    expect(result.equalHorizon).toBe(false);
    expect(result.lines.map((l) => l.steps.length)).toEqual([3, 5]);
    const c = new AbortController(),
      judge = vi.fn(evaluate);
    await expect(
      compareOpeningLines(
        async (position, options) => {
          c.abort();
          return search(position, options);
        },
        judge,
        empty,
        [p('D4'), p('Q16')],
        c.signal,
      ),
    ).rejects.toThrow();
    expect(judge).not.toHaveBeenCalled();
  });
});
