import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASS, POINTS, opposite } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { schoolPosition } from '../src/domain/school.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { certifiedEyes, lifeFinishes, lifeReadingProof } from '../src/domain/lifeReading.ts';
import { ALL_EXERCISES } from '../src/story/courseCatalog.ts';
import { RANK_FORMS } from '../src/story/rankCatalog.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';
import {
  extractAdvancedTactics,
  type AdvancedTacticExercise,
} from '../src/domain/advancedTactics.ts';
import { lifeReadingCatalog } from '../scripts/life-reading-catalog.ts';
const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
const byId = new Map(games.map((g) => [g.id, g]));
const initial = extractAdvancedTactics(games);
const oldIds = new Set(initial.map((e) => e.id));
const isNew = (ex: { id: string; module: string }) =>
  ex.module === 'life-in-two' || (ex.module === 'make-life' && !oldIds.has(ex.id));
const cases = ALL_EXERCISES.filter(isNew) as AdvancedTacticExercise[];
describe('Annales de vie certifiée', () => {
  it('reproduit 72 nouvelles positions sans altérer les 24 problèmes originaux ni les examens', () => {
    const training = ALL_EXERCISES.filter((e) => !isNew(e));
    expect(training.filter((e) => e.module === 'make-life')).toEqual(
      initial.filter((e) => e.module === 'make-life'),
    );
    const exams = RANK_FORMS.flatMap((f) => f.items.map((i) => i.exercise));
    expect(lifeReadingCatalog(games, training, exams)).toEqual(cases);
    expect(ALL_EXERCISES.filter((e) => e.module === 'make-life')).toHaveLength(59);
    expect(cases.filter((e) => e.module === 'life-in-two')).toHaveLength(37);
    const key = (e: { gameId: string; before: number }) => {
      const g = byId.get(e.gameId)!;
      return canonicalPosition(schoolPosition(g, e.before), decodeMoves(g.moves)[e.before]!.color);
    };
    const keys = new Set([...training, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
    for (const ex of cases) {
      expect(keys.has(key(ex)), ex.id).toBe(false);
      keys.add(key(ex));
      const g = byId.get(ex.gameId)!;
      expect(g.sources.length).toBeGreaterThan(0);
      expect(decodeMoves(g.moves)[ex.before]!.color).toBe(ex.color);
      const board = schoolPosition(g, ex.before);
      const target = ex.anchors[0]!;
      expect(certifiedEyes(board, target).length).toBeLessThan(2);
      if (ex.module === 'make-life') {
        expect(lifeFinishes(board, ex.color, target)).toContain(ex.candidate);
        expect(board.play(ex.color, ex.candidate!).illegal).toBeUndefined();
        expect(certifiedEyes(board, target).length).toBeGreaterThanOrEqual(2);
      }
    }
  }, 30_000);
  it('chaque vie en deux coups résiste à toute réponse légale et ne peut être résolue en un coup', () => {
    for (const ex of cases.filter((e) => e.module === 'life-in-two')) {
      const board = schoolPosition(byId.get(ex.gameId)!, ex.before);
      const target = ex.anchors[0]!,
        [first, reply, finish] = ex.line!;
      expect(lifeFinishes(board, ex.color, target)).toEqual([]);
      const proof = lifeReadingProof(board, ex.color, target, first!);
      expect(proof?.reply).toBe(reply);
      expect(proof?.finishes).toContain(finish);
      expect(board.play(ex.color, first!).illegal).toBeUndefined();
      expect(certifiedEyes(board, target).length).toBeLessThan(2);
      let checked = 0;
      for (let p = PASS; p < POINTS; p++) {
        if (p !== PASS && board.get(p) !== null) continue;
        const defended = board.clone();
        if (defended.play(opposite(ex.color), p).illegal) continue;
        checked++;
        const continuations = lifeFinishes(defended, ex.color, target);
        expect(continuations.length, ex.id).toBeGreaterThan(0);
        expect(defended.play(ex.color, continuations[0]!).illegal).toBeUndefined();
        expect(certifiedEyes(defended, target).length).toBeGreaterThanOrEqual(2);
      }
      expect(checked).toBe(proof?.legalReplies);
      expect(board.play(opposite(ex.color), reply!).illegal).toBeUndefined();
      expect(board.play(ex.color, finish!).illegal).toBeUndefined();
      expect(certifiedEyes(board, target).length).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);
});
