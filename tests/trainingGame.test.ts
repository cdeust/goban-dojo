import { describe, expect, it } from 'vitest';
import { PASS, pointFromHuman } from '../src/domain/board.ts';
import {
  areaScore,
  confirmTrainingScore,
  needsAdjudication,
  newTrainingGame,
  nextPlayer,
  resignTraining,
  toggleDeadGroup,
  trainingPosition,
  tryTrainingMove,
  type TrainingGame,
} from '../src/domain/trainingGame.ts';
import { decodeTrainingSession } from '../src/state/trainingGame.ts';

function empty(): TrainingGame {
  return newTrainingGame('B', '2026-11-27T00:00:00Z');
}
function play(points: (string | number)[], start = empty()) {
  let game = start;
  for (const p of points) {
    const result = tryTrainingMove(game, typeof p === 'number' ? p : pointFromHuman(p)!);
    expect(result.error).toBeUndefined();
    game = result.game;
  }
  return game;
}
describe('partie complète', () => {
  it('alterne les joueurs et conserve les numéros, captures et réoccupations', () => {
    const game = play(['B1', 'A1', 'A2', 'C3']);
    const { board, numbers } = trainingPosition(game.moves);
    expect(board.get(pointFromHuman('A1')!)).toBeNull();
    expect(numbers.has(pointFromHuman('A1')!)).toBe(false);
    expect(numbers.get(pointFromHuman('A2')!)).toBe(3);
    expect(nextPlayer(game)).toBe('B');
  });
  it('rejette le suicide, les intersections hors goban et les occupations sans modifier la partie', () => {
    const game = play(['B1', 'C3', 'A2']);
    expect(tryTrainingMove(game, 361).error).toBe('invalid');
    expect(tryTrainingMove(game, pointFromHuman('A2')!).error).toBe('occupied');
    expect(tryTrainingMove(game, pointFromHuman('A1')!)).toEqual({ game, error: 'suicide' });
  });
  it('interdit la reprise immédiate du ko', () => {
    const game = play(['A2', 'B2', 'B1', 'C1', 'B3', 'D2', 'Q16', 'C3', 'C2']);
    expect(tryTrainingMove(game, pointFromHuman('B2')!).error).toBe('ko');
  });
  it('deux passes nécessitent une adjudication, sans résultat implicite', () => {
    const game = play([PASS, PASS]);
    expect(needsAdjudication(game)).toBe(true);
    expect(game.result).toBeNull();
    expect(tryTrainingMove(game, 0).error).toBe('finished');
    expect(areaScore(game)).toEqual({ black: 0, white: 7.5, winner: 'W' });
    expect(confirmTrainingScore(game).result).toEqual({
      kind: 'score',
      black: 0,
      white: 7.5,
      winner: 'W',
    });
  });
  it('marque ou démarque un groupe entier, et ne modifie pas les pierres du kifu', () => {
    const game = play(['A1', 'T19', 'B1', 'S19', PASS, PASS]);
    const marked = toggleDeadGroup(game, pointFromHuman('T19')!);
    expect(marked.dead).toHaveLength(2);
    expect(areaScore(marked)).toEqual({ black: 361, white: 7.5, winner: 'B' });
    expect(trainingPosition(marked.moves).board.get(pointFromHuman('T19')!)).toBe('W');
    expect(toggleDeadGroup(marked, pointFromHuman('S19')!).dead).toEqual([]);
  });
  it('l’abandon désigne explicitement l’adversaire', () => {
    expect(resignTraining(empty()).result).toEqual({ kind: 'resign', winner: 'W' });
  });
  it('conserve le budget de recherche choisi et refuse un budget inconnu', () => {
    const game = newTrainingGame('W', '2026-11-27T00:00:00Z', 64);
    expect(decodeTrainingSession(JSON.stringify({ game, review: [] }))?.game.visits).toBe(64);
    expect(
      decodeTrainingSession(JSON.stringify({ game: { ...game, visits: 999 }, review: [] })),
    ).toBeNull();
  });
  it('reconstitue légalement la session sauvegardée et refuse un résultat falsifié', () => {
    const game = confirmTrainingScore(play(['D4', 'Q16', PASS, PASS]));
    expect(decodeTrainingSession(JSON.stringify({ game, review: [] }))).toEqual({
      game,
      review: [],
    });
    expect(
      decodeTrainingSession(
        JSON.stringify({
          game: { ...game, result: { kind: 'score', black: 500, white: 0, winner: 'B' } },
          review: [],
        }),
      ),
    ).toBeNull();
    expect(
      decodeTrainingSession(
        JSON.stringify({ game: { ...game, moves: [{ point: 0, color: 'W' }] }, review: [] }),
      ),
    ).toBeNull();
  });
});

describe('adaptateur moteur', () => {
  it('retient un vrai candidat proposé par Leela Zero, uniquement s’il est légal', async () => {
    const { vi } = await import('vitest');
    const zero = await import('../src/engine/zeroClient.ts');
    const { opponentMove } = await import('../src/state/trainingGame.ts');
    const game = play(['D4']);
    const occupied = pointFromHuman('D4')!;
    const legal = pointFromHuman('Q16')!;
    const search = vi.spyOn(zero, 'analyzeZero').mockResolvedValue({
      visits: 32,
      choices: [
        { point: occupied, visits: 20, blackWin: 0.5, line: [] },
        { point: legal, visits: 12, blackWin: 0.4, line: [] },
      ],
    });
    try {
      const next = await opponentMove(game, new AbortController().signal);
      expect(search).toHaveBeenCalledWith(
        { setupBlack: [], moves: game.moves, next: 'W', komi: 7.5 },
        expect.objectContaining({ visits: 32 }),
      );
      expect(next.moves.at(-1)).toEqual({ color: 'W', point: legal });
    } finally {
      search.mockRestore();
    }
  });
  it('n’invente aucun coup en cas d’échec du moteur', async () => {
    const { vi } = await import('vitest');
    const zero = await import('../src/engine/zeroClient.ts');
    const { opponentMove } = await import('../src/state/trainingGame.ts');
    const search = vi.spyOn(zero, 'analyzeZero').mockResolvedValue({ visits: 0, choices: [] });
    try {
      await expect(opponentMove(play(['D4']), new AbortController().signal)).rejects.toThrow(
        'aucun coup légal',
      );
    } finally {
      search.mockRestore();
    }
  });
});
