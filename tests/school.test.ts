import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POINTS, opposite } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import {
  exerciseAnswer,
  emptyRegion,
  extractSchools,
  isMoveModule,
  schoolPosition,
  schoolWindow,
  SCHOOL_MODULES,
  type SchoolExercise,
} from '../src/domain/school.ts';
import {
  emptySchoolProgress,
  moduleProgress,
  markSchoolFailure,
  recommendSchool,
  recordSchool,
} from '../src/domain/schoolProgress.ts';
import { decodeSchoolProgress } from '../src/state/schoolProgress.ts';
import catalogJson from '../src/story/schoolCatalog.json';
const catalog = catalogJson as SchoolExercise[];
const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const games = new Map(data.games.map((g) => [g.id, g]));

describe('École basée sur de vrais kifus', () => {
  it('reproduit exactement les 264 exercices, 24 par module, sur la carrière entière', () => {
    expect(extractSchools(data.games)).toEqual(catalog);
    expect(catalog).toHaveLength(264);
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    for (const module of SCHOOL_MODULES)
      expect(catalog.filter((e) => e.module === module.id)).toHaveLength(24);
    expect(new Set(catalog.map((e) => e.gameId)).size).toBeGreaterThanOrEqual(40);
    const years = catalog.map((e) => Number(games.get(e.gameId)!.date.slice(0, 4)));
    expect(Math.min(...years)).toBeLessThanOrEqual(1840);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(1860);
  });
  it('valide chaque objectif par les règles, sans modifier la position d’origine', () => {
    const legality: Record<string, number> = {};
    const liberty: Record<number, number> = {};
    const borders: Record<number, number> = {};
    const regionSizes: Record<number, number> = {};
    for (const ex of catalog) {
      const game = games.get(ex.gameId)!;
      expect(game.sources.length).toBeGreaterThan(0);
      const board = schoolPosition(game, ex.before);
      const identity = board.positionKey();
      const move = decodeMoves(game.moves)[ex.before]!;
      expect(move.color).toBe(ex.color);
      for (const anchor of ex.anchors) {
        if (ex.module === 'region-border' || ex.module === 'region-size')
          expect(board.get(anchor)).toBeNull();
        else expect(board.get(anchor)).not.toBeNull();
      }
      if (ex.module === 'region-border' || ex.module === 'region-size') {
        const region = emptyRegion(board, ex.candidate!);
        expect(region.points.sort()).toEqual([...ex.anchors].sort());
        if (ex.module === 'region-size') {
          expect(region.border.size).toBe(1);
          const n = region.points.length;
          regionSizes[n] = (regionSizes[n] ?? 0) + 1;
          expect(exerciseAnswer(board, ex, n)).toBe(true);
          expect(exerciseAnswer(board, ex, n + 1)).toBe(false);
        } else {
          const result = region.border.size === 2 ? 3 : region.border.has('B') ? 1 : 2;
          borders[result] = (borders[result] ?? 0) + 1;
          expect(exerciseAnswer(board, ex, result)).toBe(true);
          expect(exerciseAnswer(board, ex, result === 1 ? 2 : 1)).toBe(false);
        }
      } else if (ex.module === 'liberties') {
        const count = board.libertyCount(ex.anchors[0]!);
        liberty[count] = (liberty[count] ?? 0) + 1;
        expect(exerciseAnswer(board, ex, count)).toBe(true);
        expect(exerciseAnswer(board, ex, count + 1)).toBe(false);
      } else if (ex.module === 'legality') {
        const result = board.clone().play(ex.color, ex.candidate!);
        const reason = result.illegal ?? 'legal';
        legality[reason] = (legality[reason] ?? 0) + 1;
        expect(exerciseAnswer(board, ex, !result.illegal)).toBe(true);
        expect(exerciseAnswer(board, ex, !!result.illegal)).toBe(false);
      } else {
        expect(isMoveModule(ex.module)).toBe(true);
        expect(exerciseAnswer(board, ex, move.point)).toBe(true);
        const window = schoolWindow(board, ex);
        const x = move.point % 19,
          y = Math.floor(move.point / 19);
        expect(x).toBeGreaterThanOrEqual(window.x);
        expect(y).toBeGreaterThanOrEqual(window.y);
        expect(x).toBeLessThan(window.x + window.size);
        expect(y).toBeLessThan(window.y + window.size);
        // Toutes les réponses possibles sont évaluées, un coup valide autre que le kifu reste accepté.
        const accepted = Array.from({ length: POINTS }, (_, i) => i).filter((i) =>
          exerciseAnswer(board, ex, i),
        );
        expect(accepted).toContain(move.point);
        if (ex.module === 'capture-one' || ex.module === 'capture-chain') {
          expect(accepted).toEqual([move.point]);
          expect(board.get(ex.anchors[0]!)).toBe(opposite(ex.color));
          expect(board.libertyCount(ex.anchors[0]!)).toBe(1);
        }
      }
      expect(board.positionKey()).toBe(identity);
    }
    expect(liberty).toEqual({ 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 });
    expect(legality).toEqual({ legal: 12, ko: 6, suicide: 6 });
    expect(borders).toEqual({ 1: 8, 2: 8, 3: 8 });
    expect(regionSizes).toEqual({ 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 });
  });
  it('conserve la réussite de transfert initiale et personnalise les recommandations même à nombre de résultats égal', () => {
    const day = 20_000;
    const initial = emptySchoolProgress();
    const first = recommendSchool(catalog, initial, day)!;
    expect(first.module).toBe('liberties');
    const solved = recordSchool(initial, first.id, 'exact', day);
    const abandoned = markSchoolFailure(initial, first.id, day);
    expect(recommendSchool(catalog, abandoned, day)?.id).toBe(first.id);
    expect(recordSchool(abandoned, first.id, 'exact', day).records[0]?.firstTry).toBe(false);
    expect(decodeSchoolProgress(JSON.stringify(abandoned))).toEqual(abandoned);
    expect(recommendSchool(catalog, solved, day)?.id).not.toBe(first.id);
    const shown = recordSchool(initial, first.id, 'shown', day);
    expect(recommendSchool(catalog, shown, day + 1)?.id).toBe(first.id);
    const second = recordSchool(shown, first.id, 'exact', day + 1);
    expect(second.records[0]?.firstTry).toBe(false);
    expect(moduleProgress(catalog, second, first.module, day + 1)).toEqual({
      attempted: 1,
      firstTry: 0,
      exact: 1,
      due: 0,
    });
    expect(decodeSchoolProgress(JSON.stringify(second))).toEqual(second);
    expect(
      decodeSchoolProgress(
        JSON.stringify({ ...second, records: [...second.records, ...second.records] }),
      ),
    ).toBeNull();
    expect(decodeSchoolProgress(JSON.stringify({ ...second, version: 2 }))).toBeNull();
    expect(recordSchool(second, first.id, 'exact', day + 1)).toBe(second);
    const capture = catalog.find((e) => e.module === 'capture-one')!;
    const a = recordSchool(recordSchool(initial, first.id, 'shown', day), capture.id, 'exact', day);
    const b = recordSchool(recordSchool(initial, first.id, 'exact', day), capture.id, 'shown', day);
    expect(recommendSchool(catalog, a, day + 1)?.module).toBe('liberties');
    expect(recommendSchool(catalog, b, day + 1)?.module).toBe('capture-one');
  });
});
