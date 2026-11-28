import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { schoolPosition, emptyRegion } from '../src/domain/school.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { ALL_EXERCISES } from '../src/story/courseCatalog.ts';
import { RANK_FORMS } from '../src/story/rankCatalog.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';
import {
  extractStrategyCourse,
  MIDDLE_STUDY_MODULES,
  type StrategyLesson,
} from '../src/story/strategyCourse.ts';
import { phaseStudies } from '../scripts/phase-studies.ts';

const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
const byId = new Map(games.map((g) => [g.id, g]));
const baselineIds = new Set(extractStrategyCourse(games).map((e) => e.id));
const mid = new Set<string>(MIDDLE_STUDY_MODULES.map((m) => m.id));
const isExtra = (ex: { id: string; module: string }) =>
  ex.module === 'yose-decision' || (mid.has(ex.module) && !baselineIds.has(ex.id));
const extra = ALL_EXERCISES.filter(isExtra) as StrategyLesson[];

describe('Décisions du milieu de partie au yose', () => {
  it('reproduit 32 études intermédiaires et 24 fins de partie, sans collisions de positions', () => {
    const teaching = ALL_EXERCISES.filter((e) => !isExtra(e));
    const exams = RANK_FORMS.flatMap((f) => f.items.map((i) => i.exercise));
    const actual = phaseStudies(games, teaching, exams);
    expect(new Map(actual.map((e) => [e.id, e]))).toEqual(new Map(extra.map((e) => [e.id, e])));
    expect(extra).toHaveLength(56);
    const key = (ex: { gameId: string; before: number }) => {
      const g = byId.get(ex.gameId)!;
      return canonicalPosition(
        schoolPosition(g, ex.before),
        decodeMoves(g.moves)[ex.before]!.color,
      );
    };
    const used = new Set([...teaching, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
    for (const module of MIDDLE_STUDY_MODULES) {
      const cases = extra.filter((e) => e.module === module.id);
      expect(cases).toHaveLength(8);
      expect(new Set(cases.map((e) => e.gameId)).size).toBe(8);
      expect(cases.every((e) => e.before >= 35)).toBe(true);
    }
    const yose = extra.filter((e) => e.module === 'yose-decision');
    expect(yose).toHaveLength(24);
    expect(new Set(yose.map((e) => e.gameId)).size).toBe(24);
    for (const ex of extra) {
      expect(used.has(key(ex)), ex.id).toBe(false);
      used.add(key(ex));
      const g = byId.get(ex.gameId)!,
        moves = decodeMoves(g.moves),
        board = schoolPosition(g, ex.before);
      expect(ex.evidence.sources).toEqual(g.sources);
      expect(ex.evidence.historicalLine).toEqual(moves.slice(ex.before, ex.before + 5));
      expect(ex.evidence.historicalLine).toHaveLength(5);
      expect(moves[ex.before]).toEqual({ color: ex.color, point: ex.historical });
      for (const alt of ex.evidence.alternativeSources) {
        expect(alt.before > ex.before).toBe(true);
        expect(moves[alt.before]).toEqual({ color: ex.color, point: alt.point });
      }
      for (const p of [ex.historical, ...ex.alternatives]) {
        const play = board.clone().play(ex.color, p);
        expect(play.illegal).toBeUndefined();
        if (ex.module === 'yose-decision') {
          expect(ex.before >= Math.max(100, Math.floor(moves.length * 0.7))).toBe(true);
          expect(ex.alternatives).toHaveLength(2);
          const candidates = [ex.historical, ...ex.alternatives];
          for (const [i, a] of candidates.entries())
            for (const b of candidates.slice(i + 1))
              expect(
                Math.abs((a % 19) - (b % 19)) + Math.abs(Math.floor(a / 19) - Math.floor(b / 19)),
              ).toBeGreaterThanOrEqual(5);

          const region = emptyRegion(board, p);
          expect(play.captures.length <= 2).toBe(true);
          expect(
            play.captures.length > 0 || (region.points.length <= 12 && region.border.size === 2),
          ).toBe(true);
        }
      }
    }
  }, 30_000);
});
