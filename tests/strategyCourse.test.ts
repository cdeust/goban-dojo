import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS, opposite, type Color } from '../src/domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import {
  BRIDGE_MODULES,
  extractStrategyCourse,
  STRATEGY_MODULES,
} from '../src/story/strategyCourse.ts';

const data = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
const course = extractStrategyCourse(data.games);

describe('real-kifu strategic curriculum', () => {
  it('provides 12 distinct authentic positions per module without trusting the detector to determine best moves', () => {
    expect(course).toHaveLength(180);
    expect(BRIDGE_MODULES).toHaveLength(8);
    expect(BRIDGE_MODULES.map((m) => m.level)).toEqual([2, 3, 4, 4, 5, 5, 6, 6]);
    const openings = course.filter((l) => l.module === 'opening-lines');
    for (const before of [1, 2, 3])
      expect(openings.filter((l) => l.before === before)).toHaveLength(4);
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
      expect(lesson.evidence.historicalLine).toHaveLength(5);
      const replay = boardAt(decodePoints(game.setupBlack), moves, lesson.before);
      for (const [i, historical] of lesson.evidence.historicalLine.entries()) {
        expect(replay.play(historical.color, historical.point).illegal).toBeUndefined();
        expect(replay.positionKey()).toBe(
          boardAt(decodePoints(game.setupBlack), moves, lesson.before + i + 1).positionKey(),
        );
      }
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
    const corner = (p: number) => {
      const [x, y] = coordinate(p);
      if (Math.min(x, 18 - x) > 5 || Math.min(y, 18 - y) > 5) return -1;
      return (x > 9 ? 1 : 0) + (y > 9 ? 2 : 0);
    };
    for (const lesson of course) {
      const game = data.games.find((g) => g.id === lesson.gameId)!;
      const moves = decodeMoves(game.moves);
      const board = boardAt(decodePoints(game.setupBlack), moves, lesson.before);
      const point = lesson.historical;
      const anchor = lesson.anchors[0]!;
      const colors = (color: Color) =>
        Array.from({ length: 361 }, (_, p) => p).filter((p) => board.get(p) === color);
      const after = board.clone();
      expect(after.play(lesson.color, point).illegal).toBeUndefined();
      const own = colors(lesson.color),
        enemy = colors(opposite(lesson.color));
      switch (lesson.module) {
        case 'opening-lines': {
          expect(game.handicap).toBe(0);
          const [x, y] = coordinate(point);
          expect(
            [Math.min(x, 18 - x) + 1, Math.min(y, 18 - y) + 1].every((n) => n === 3 || n === 4),
          ).toBe(true);
          expect([...own, ...enemy].every((q) => corner(q) !== corner(point))).toBe(true);
          break;
        }
        case 'corner-enclosure': {
          expect(game.handicap).toBe(0);
          expect(own.filter((q) => corner(q) === corner(point))).toEqual([anchor]);
          expect(enemy.every((q) => corner(q) !== corner(point))).toBe(true);
          const [x, y] = coordinate(point),
            [u, v] = coordinate(anchor);
          expect(Math.abs(x - u) * Math.abs(y - v)).toBe(2);
          break;
        }
        case 'side-base': {
          const [x, y] = coordinate(point),
            [u, v] = coordinate(anchor);
          expect(x === u || y === v).toBe(true);
          expect(line(point)).toBe(line(anchor));
          expect(line(point)).toBeGreaterThanOrEqual(3);
          expect(line(point)).toBeLessThanOrEqual(4);
          expect(board.get(anchor)).toBe(lesson.color);
          const d = manhattan(anchor, point);
          expect(d).toBeGreaterThanOrEqual(3);
          expect(d).toBeLessThanOrEqual(5);
          const step = (point - anchor) / d;
          for (let k = 1; k < d; k++) expect(board.get(anchor + k * step)).toBeNull();
          expect(enemy.every((q) => manhattan(q, point) > 1)).toBe(true);
          break;
        }
        case 'opening-approach': {
          expect(game.handicap).toBe(0);
          const [x, y] = coordinate(point),
            [u, v] = coordinate(anchor);
          expect(Math.abs(x - u) * Math.abs(y - v)).toBe(2);
          expect(board.get(anchor)).toBe(opposite(lesson.color));
          expect(own.every((q) => corner(q) !== corner(point))).toBe(true);
          break;
        }
        case 'shape-connection': {
          expect(lesson.anchors.length).toBeGreaterThanOrEqual(2);
          expect(new Set(lesson.anchors.map((q) => Math.min(...board.stonesOf(q)))).size).toBe(
            lesson.anchors.length,
          );
          expect(
            lesson.anchors.every((q) => board.get(q) === lesson.color && manhattan(q, point) === 1),
          ).toBe(true);
          expect(lesson.anchors.every((q) => after.stonesOf(point).includes(q))).toBe(true);
          expect(after.stonesOf(point).length).toBe(lesson.evidence.resultingSize);
          expect(after.libertyCount(point)).toBe(lesson.evidence.resultingLiberties);
          break;
        }
        case 'central-exit': {
          const [x, y] = coordinate(point),
            [u, v] = coordinate(anchor);
          expect(x === u || y === v).toBe(true);
          expect(manhattan(point, anchor)).toBe(2);
          expect(line(point) - line(anchor)).toBe(2);
          expect(board.get((point + anchor) / 2)).toBeNull();
          expect(board.get(anchor)).toBe(lesson.color);
          expect(after.stonesOf(point)).not.toContain(anchor);
          break;
        }
        case 'opening-transition':
          expect(lesson.anchors).toEqual([moves[lesson.before - 1]!.point]);
          expect(
            moves
              .slice(lesson.before - 3, lesson.before)
              .every((m) => m.point !== PASS && corner(m.point) === corner(anchor)),
          ).toBe(true);
          expect(corner(anchor)).toBeGreaterThanOrEqual(0);
          expect(manhattan(point, anchor)).toBeGreaterThanOrEqual(8);
          expect(own.some((q) => manhattan(point, q) <= 4)).toBe(true);
          break;
        case 'weak-group':
          expect(board.get(anchor)).toBe(lesson.color);
          expect(board.stonesOf(anchor).length).toBe(lesson.evidence.anchorSize);
          expect(lesson.evidence.anchorSize).toBeGreaterThanOrEqual(2);
          expect(board.libertyCount(anchor)).toBe(lesson.evidence.anchorLiberties);
          expect(lesson.evidence.anchorLiberties).toBeGreaterThanOrEqual(2);
          expect(lesson.evidence.anchorLiberties).toBeLessThanOrEqual(3);
          expect(after.stonesOf(point)).toContain(anchor);
          expect(after.stonesOf(point).length).toBe(lesson.evidence.resultingSize);
          expect(after.libertyCount(point)).toBe(lesson.evidence.resultingLiberties);
          expect(after.libertyCount(point)).toBeGreaterThanOrEqual(board.libertyCount(anchor) + 2);
          break;
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
