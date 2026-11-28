import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { extractSchools, schoolPosition } from '../src/domain/school.ts';
import { extractAdvancedTactics } from '../src/domain/advancedTactics.ts';
import { extractEndgame } from '../src/domain/endgameCourse.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { BRIDGE_MODULES, extractStrategyCourse } from '../src/story/strategyCourse.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';
import { RANK_FORMS } from '../src/story/rankCatalog.ts';
import { courseSupplement, interleaveSupplement } from '../scripts/course-supplement.ts';
import schoolCatalog from '../src/story/schoolCatalog.json';
import strategyCatalog from '../src/story/strategyCatalog.json';

const data = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;

describe('Complément de parcours', () => {
  it('préserve les positions historiques, régénère 56 nouvelles positions et protège les examens', () => {
    const school = extractSchools(data.games);
    const strategy = extractStrategyCourse(data.games);
    const training = [
      ...school,
      ...strategy,
      ...extractAdvancedTactics(data.games),
      ...extractEndgame(data.games),
    ];
    const exams = RANK_FORMS.flatMap((form) => form.items.map((item) => item.exercise));
    const extra = courseSupplement(data.games, training, exams);
    expect(interleaveSupplement(school, extra.school, 2)).toEqual(schoolCatalog);
    expect(interleaveSupplement(strategy, extra.strategy, 3)).toEqual(strategyCatalog);
    expect(extra.school).toHaveLength(24);
    for (const module of ['liberties', 'region-size']) {
      const firstTwo = schoolCatalog.filter((e) => e.module === module).slice(0, 2);
      expect(extra.school.some((e) => e.id === firstTwo[1]?.id)).toBe(true);
    }
    expect(extra.strategy).toHaveLength(32);
    const gameMap = new Map(data.games.map((g) => [g.id, g]));
    const key = (ex: { gameId: string; before: number }) => {
      const game = gameMap.get(ex.gameId)!;
      return canonicalPosition(
        schoolPosition(game, ex.before),
        decodeMoves(game.moves)[ex.before]!.color,
      );
    };
    const used = new Set([...training, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
    const examGames = new Set(exams.map((e) => e.gameId));
    for (const ex of [...extra.school, ...extra.strategy]) {
      const identity = key(ex);
      expect(used.has(identity), ex.id).toBe(false);
      expect(examGames.has(ex.gameId), ex.id).toBe(false);
      used.add(identity);
      const game = gameMap.get(ex.gameId)!;
      expect(game.sources.length).toBeGreaterThan(0);
      expect(decodeMoves(game.moves)[ex.before]!.color).toBe(ex.color);
    }
    for (const module of BRIDGE_MODULES) {
      const cases = extra.strategy.filter((ex) => ex.module === module.id);
      expect(cases).toHaveLength(4);
      expect(new Set(cases.map((e) => e.gameId)).size).toBe(4);
      for (const ex of cases) {
        const game = gameMap.get(ex.gameId)!;
        const moves = decodeMoves(game.moves);
        expect(ex.historical).toBe(moves[ex.before]!.point);
        expect(ex.evidence.historicalLine).toEqual(moves.slice(ex.before, ex.before + 5));
        expect(ex.evidence.sources).toEqual(game.sources);
        const board = schoolPosition(game, ex.before);
        for (const p of [ex.historical, ...ex.alternatives])
          expect(board.clone().play(ex.color, p).illegal).toBeUndefined();
      }
    }
  }, 30_000);
});
