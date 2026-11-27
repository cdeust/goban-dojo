import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pointFromHuman } from '../src/domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { emptyPractice, recordRecall } from '../src/domain/practice.ts';
import { FIRST_LESSON, LESSONS, lessonCard, recommendedLesson } from '../src/story/lessons.ts';

const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const p = (name: string) => pointFromHuman(name)!;
function position(id: string) {
  const lesson = LESSONS.find((item) => item.id === id)!;
  const game = data.games.find((item) => item.id === lesson.gameId)!;
  const moves = decodeMoves(game.moves);
  return {
    board: boardAt(decodePoints(game.setupBlack), moves, lesson.before),
    move: moves[lesson.before]!,
  };
}

describe('Parcours du dojo', () => {
  it('vérifie des positions distinctes, deux compétences et deux niveaux', () => {
    expect(new Set(LESSONS.map(({ id }) => id)).size).toBe(LESSONS.length);
    expect(new Set(LESSONS.map(({ gameId, before }) => `${gameId}:${before}`)).size).toBe(
      LESSONS.length,
    );
    expect(new Set(LESSONS.map(({ theme }) => theme)).size).toBe(2);
    expect(new Set(LESSONS.map(({ difficulty }) => difficulty)).size).toBe(2);
  });

  it('capture trois pierres par leur liberté commune', () => {
    const { board, move } = position('capturer-un-groupe');
    expect(move).toEqual({ color: 'B', point: p('S4') });
    expect(board.stonesOf(p('R4')).sort()).toEqual([p('R4'), p('R5'), p('Q5')].sort());
    expect(board.libertyCount(p('R4'))).toBe(1);
    const result = board.play(move.color, move.point);
    expect(result.illegal).toBeUndefined();
    expect(result.captures.sort()).toEqual([p('R4'), p('R5'), p('Q5')].sort());
  });

  it('relie effectivement deux ou trois groupes distincts avec les libertés annoncées', () => {
    const cases = [
      {
        id: 'relier-pour-sauver',
        anchors: ['Q14', 'R16'],
        color: 'B',
        target: 'Q16',
        liberties: 6,
      },
      {
        id: 'reunir-trois-groupes',
        anchors: ['C13', 'B12', 'B14'],
        color: 'W',
        target: 'B13',
        liberties: 5,
      },
    ] as const;
    for (const c of cases) {
      const { board, move } = position(c.id);
      expect(move).toEqual({ color: c.color, point: p(c.target) });
      for (const anchor of c.anchors) expect(board.get(p(anchor))).toBe(c.color);
      expect(board.libertyCount(p(c.anchors[0]))).toBe(1);
      expect(new Set(c.anchors.map((x) => Math.min(...board.stonesOf(p(x))))).size).toBe(
        c.anchors.length,
      );
      expect(board.play(move.color, move.point)).toEqual({ captures: [] });
      expect(board.libertyCount(move.point)).toBe(c.liberties);
      expect(board.stonesOf(move.point)).toEqual(expect.arrayContaining(c.anchors.map(p)));
    }
  });

  it('recommande selon le carnet individuel, sans bloquer les autres niveaux', () => {
    const day = 20_000;
    const first = emptyPractice();
    expect(recommendedLesson(first, day)).toBe(FIRST_LESSON);
    const solved = recordRecall(first, FIRST_LESSON.gameId, FIRST_LESSON.before, 'exact', day);
    expect(lessonCard(FIRST_LESSON, solved)?.stage).toBe(1);
    expect(recommendedLesson(solved, day)?.id).toBe('relier-pour-sauver');
    expect(recommendedLesson(solved, day + 1)).toBe(FIRST_LESSON);
    expect(recommendedLesson(first, day + 1)).toBe(FIRST_LESSON);
  });
});
