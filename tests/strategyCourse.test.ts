import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS, opposite, type Color } from '../src/domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { extractStrategyCourse, STRATEGY_MODULES } from '../src/story/strategyCourse.ts';

const data = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
const course = extractStrategyCourse(data.games);

describe('real-kifu strategic curriculum', () => {
  it('provides 12 distinct authentic positions per module without trusting the detector to determine best moves', () => {
    expect(course).toHaveLength(84);
    expect(new Set(course.map((l) => l.id)).size).toBe(course.length);
    expect(new Set(course.map((l) => l.gameId + ':' + l.before)).size).toBe(course.length);
    for (const module of STRATEGY_MODULES) {
      const lessons = course.filter((l) => l.module === module.id);
      expect(lessons).toHaveLength(12);
      expect(new Set(lessons.map((l) => l.gameId)).size).toBe(12);
      expect(
        new Set(lessons.map((l) => data.games.find((g) => g.id === l.gameId)!.date.slice(0, 4)))
          .size,
      ).toBeGreaterThan(3);
    }
    expect(extractStrategyCourse([...data.games].reverse())).toEqual(course);
    expect(extractStrategyCourse(data.games, 0)).toEqual([]);
    expect(extractStrategyCourse([], 12)).toEqual([]);
  });

  it('preserves the complete historical provenance, exact prefix and legal candidate coordinates', () => {
    for (const lesson of course) {
      const game = data.games.find((g) => g.id === lesson.gameId)!;
      expect(game.imported).not.toBe(true);
      expect(lesson.id).toBe(lesson.module + ':' + game.id + ':' + lesson.before);
      expect(lesson.evidence.sources).toEqual(game.sources);
      expect(lesson.evidence.sources.length).toBeGreaterThan(0);
      const moves = decodeMoves(game.moves);
      expect(moves[lesson.before]).toEqual({ color: lesson.color, point: lesson.historical });
      expect(lesson.evidence.historicalLine).toEqual(moves.slice(lesson.before, lesson.before + 5));
      const board = boardAt(decodePoints(game.setupBlack), moves, lesson.before);
      const seen = new Set(
        Array.from({ length: lesson.before + 1 }, (_, n) =>
          boardAt(decodePoints(game.setupBlack), moves, n).positionKey(),
        ),
      );
      for (const p of [lesson.historical, ...lesson.alternatives]) {
        expect(p).not.toBe(PASS);
        expect(board.get(p)).toBeNull();
        const trial = board.clone();
        expect(trial.play(lesson.color, p).illegal).toBeUndefined();
        expect(seen.has(trial.positionKey())).toBe(false);
      }
      expect(lesson.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(lesson.alternatives.length).toBeLessThanOrEqual(2);
      expect(new Set([lesson.historical, ...lesson.alternatives]).size).toBe(
        1 + lesson.alternatives.length,
      );
      expect(lesson.evidence.alternativeSources.map((x) => x.point)).toEqual(lesson.alternatives);
      for (const alternative of lesson.evidence.alternativeSources) {
        expect(alternative.before).toBeGreaterThan(lesson.before);
        expect(moves[alternative.before]).toEqual({
          color: lesson.color,
          point: alternative.point,
        });
      }
      expect(lesson.prompt).not.toContain('Le kifu');
      expect(lesson.observation).not.toEqual(lesson.prompt);
    }
  });

  it('checks exact geometric evidence independently', () => {
    const coordinate = (p: number) => [p % 19, Math.floor(p / 19)] as const;
    const manhattan = (a: number, b: number) => {
      const [x, y] = coordinate(a),
        [u, v] = coordinate(b);
      return Math.abs(x - u) + Math.abs(y - v);
    };
    const line = (p: number) => {
      const [x, y] = coordinate(p);
      return 1 + Math.min(x, y, 18 - x, 18 - y);
    };
    for (const lesson of course) {
      const game = data.games.find((g) => g.id === lesson.gameId)!;
      const moves = decodeMoves(game.moves);
      const board = boardAt(decodePoints(game.setupBlack), moves, lesson.before);
      const point = lesson.historical;
      const anchor = lesson.anchors[0]!;
      const colors = (color: Color) =>
        Array.from({ length: 361 }, (_, p) => p).filter((p) => board.get(p) === color);
      switch (lesson.module) {
        case 'fuseki': {
          const [x, y] = coordinate(point);
          expect(Math.min(x, 18 - x)).toBeLessThanOrEqual(5);
          expect(Math.min(y, 18 - y)).toBeLessThanOrEqual(5);
          for (const p of [...colors('B'), ...colors('W')]) {
            const [u, v] = coordinate(p);
            const sameSideX = x < 9 ? u < 6 : u > 12;
            const sameSideY = y < 9 ? v < 6 : v > 12;
            expect(sameSideX && sameSideY).toBe(false);
          }
          break;
        }
        case 'approach': {
          const [x, y] = coordinate(point),
            [u, v] = coordinate(anchor);
          expect(Math.abs(x - u) * Math.abs(y - v)).toBe(2);
          expect(board.get(anchor)).toBe(opposite(lesson.color));
          break;
        }
        case 'corner-response':
          expect(anchor).toBe(moves[lesson.before - 1]!.point);
          expect(manhattan(point, anchor)).toBeLessThanOrEqual(4);
          expect(board.get(lesson.anchors[1]!)).toBe(lesson.color);
          break;
        case 'direction':
          expect(line(point)).toBe(line(anchor));
          expect(board.get(anchor)).toBe(lesson.color);
          expect(manhattan(point, anchor)).toBeGreaterThanOrEqual(2);
          expect(manhattan(point, anchor)).toBeLessThanOrEqual(4);
          break;
        case 'influence':
          expect(board.get(anchor)).toBe(lesson.color);
          expect(board.stonesOf(anchor).length).toBe(lesson.evidence.anchorSize);
          expect(board.libertyCount(anchor)).toBe(lesson.evidence.anchorLiberties);
          expect(line(point)).toBeGreaterThan(line(anchor));
          break;
        case 'reduction':
          expect(colors(lesson.color).every((q) => manhattan(q, point) > 2)).toBe(true);
          expect(
            lesson.anchors.every(
              (q) => board.get(q) === opposite(lesson.color) && manhattan(q, point) <= 4,
            ),
          ).toBe(true);
          break;
        case 'initiative':
          expect(anchor).toBe(moves[lesson.before - 1]!.point);
          expect(manhattan(point, anchor)).toBeGreaterThanOrEqual(8);
          expect(lesson.alternatives.every((q) => manhattan(q, anchor) <= 4)).toBe(true);
          break;
      }
    }
  });
});
