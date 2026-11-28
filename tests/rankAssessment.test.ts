import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pointToHuman, opposite } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import {
  captureSequenceSolutions,
  emptyRegion,
  isMoveModule,
  schoolPosition,
  schoolQuestion,
  schoolSolution,
} from '../src/domain/school.ts';
import { safeEyes } from '../src/domain/advancedTactics.ts';
import {
  activeRankAttempt,
  answerRankItem,
  abandonRankAttempt,
  decodeRankProgress,
  emptyRankProgress,
  finishRankAttempt,
  gradeRule,
  nextRankForm,
  rankBandEvidence,
  rankNextBand,
  RANK_BANDS,
  startRankAttempt,
  validateRankProgress,
  type RankAnswer,
  type RankForm,
  type RankItem,
  type RankProgress,
} from '../src/domain/rankAssessment.ts';
import {
  emptySchoolProgress,
  markSchoolFailure,
  recordSchool,
} from '../src/domain/schoolProgress.ts';
import {
  decodeSchoolProgress,
  saveSchoolProgress,
  loadSchoolProgress,
} from '../src/state/schoolProgress.ts';
import {
  AccountPersistence,
  type ProgressBackend,
  type ProgressEntry,
} from '../src/state/accountPersistence.ts';
import { progressSession, setProgressSession } from '../src/state/sessionProgress.ts';
import { ALL_EXERCISES } from '../src/story/courseCatalog.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { RANK_FORMS } from '../src/story/rankCatalog.ts';
const dataset = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const game = (item: RankItem) => dataset.games.find((g) => g.id === item.exercise.gameId)!;
function correctAnswer(item: RankItem): RankAnswer {
  const ex = item.exercise;
  const g = game(item);
  const board = schoolPosition(g, ex.before);
  if (item.kind === 'strategy') return item.exercise.historical;
  if (item.kind === 'endgame') return item.exercise.answer;
  if (item.kind === 'tactic')
    return item.exercise.module === 'two-eyes'
      ? safeEyes(board, ex.anchors[0]!).length >= 2
      : item.exercise.candidate!;
  if (isMoveModule(item.exercise.module)) return decodeMoves(g.moves)[ex.before]!.point;
  if (ex.module === 'legality')
    return !board.clone().play(ex.color, item.exercise.candidate!).illegal;
  if (ex.module === 'liberties') return board.libertyCount(ex.anchors[0]!);
  const region = emptyRegion(board, item.exercise.candidate!);
  return ex.module === 'region-size'
    ? region.points.length
    : region.border.size === 2
      ? 3
      : region.border.has('B')
        ? 1
        : 2;
}
function pass(progress: RankProgress, form: RankForm, day: number, skips = 0) {
  let next = startRankAttempt(progress, form, day);
  for (const [index, item] of form.items.entries())
    next = answerRankItem(next, form, index, index < skips ? null : correctAnswer(item));
  const answers = activeRankAttempt(next)!.answers;
  // Test all actual rule items, never a synthetic grade or fake engine prediction.
  const grades = form.items.map((item, index) => {
    if (item.kind === 'strategy') throw new Error('The deterministic test uses a rule-only form.');
    return gradeRule(item, game(item), answers[index]!);
  });
  return finishRankAttempt(next, form, day, grades);
}

describe('Épreuves historiques réservées', () => {
  it('explicite le dernier coup et le point inclus dans les deux questions historiques signalées', () => {
    const form = RANK_FORMS.find((f) => f.id === 'initiation-3')!;
    const ko = form.items[6]!;
    const region = form.items[7]!;
    if (ko.kind !== 'school' || region.kind !== 'school') throw new Error('Épreuve modifiée');
    const koGame = game(ko);
    const koBoard = schoolPosition(koGame, ko.exercise.before);
    expect(schoolQuestion(koBoard, ko.exercise, koGame)).toContain(
      'Au dernier coup (n°60), Blanc a joué en D10 et a capturé la pierre en E10. Aucun coup n’a été joué depuis.',
    );
    expect(gradeRule(ko, koGame, false).correct).toBe(true);
    const regionGame = game(region);
    const regionBoard = schoolPosition(regionGame, region.exercise.before);
    expect(schoolQuestion(regionBoard, region.exercise, regionGame)).toContain(
      'T3 ? Comptez aussi ce point (marqué « ? »), une seule fois.',
    );
    expect(gradeRule(region, regionGame, 6).correct).toBe(true);
    expect(gradeRule(region, regionGame, 5).correct).toBe(false);
  });
  it('prouve les dix premiers coups acceptés dans les huit lectures réservées et explique une variante réelle', () => {
    const items = RANK_FORMS.flatMap((f) => f.items).filter(
      (i) => i.kind === 'school' && i.exercise.module === 'capture-sequence',
    );
    expect(items).toHaveLength(8);
    let total = 0;
    for (const item of items) {
      if (item.kind !== 'school') throw new Error('Type inattendu');
      const ex = item.exercise;
      const g = game(item);
      const board = schoolPosition(g, ex.before);
      const solutions = captureSequenceSolutions(board, ex);
      total += solutions.length;
      const allAccepted = Array.from({ length: 361 }, (_, point) => point).filter(
        (point) => gradeRule(item, g, point).correct,
      );
      expect(solutions.map((s) => s.first)).toEqual(allAccepted);
      for (const solution of solutions) {
        const next = board.clone();
        expect(next.play(ex.color, solution.first).illegal).toBeUndefined();
        expect(next.play(opposite(ex.color), solution.defense.reply).illegal).toBeUndefined();
        const finish = next.play(ex.color, solution.defense.finish);
        expect(finish.illegal).toBeUndefined();
        expect(finish.captures).toContain(ex.anchors[0]);
        const text = schoolSolution(board, ex, correctAnswer(item) as number, solution.first);
        expect(text).toContain(`${ex.before + 1}. ${pointToHuman(solution.first)}`);
        expect(text).toContain(`${ex.before + 3}. ${pointToHuman(solution.defense.finish)}`);
      }
    }
    expect(total).toBe(10);
  });
  it('couvre quatre objectifs, quatre formulaires par jalon, huit parties distinctes et aucun kifu scolaire ou micro-leçon', () => {
    expect(RANK_FORMS).toHaveLength(16);
    const reserved = RANK_FORMS.flatMap((f) => f.items.map((item) => item.exercise.gameId));
    expect(reserved).toHaveLength(128);
    expect(new Set(reserved).size).toBe(128);
    const study = new Set(
      [...ALL_EXERCISES, ...LESSONS, ...OPENING_CASE_POSITIONS].map((e) => e.gameId),
    );
    expect(reserved.filter((id) => study.has(id))).toEqual([]);
    for (const band of RANK_BANDS) {
      const forms = RANK_FORMS.filter((f) => f.band === band.id);
      expect(forms).toHaveLength(4);
      for (const form of forms)
        expect(form.items.map((i) => i.exercise.module)).toEqual([...band.modules]);
    }
  });
  it('interdit aussi les fuites de positions, même sous rotation ou réflexion et dans des parties différentes', () => {
    const key = (item: { gameId: string; before: number }) => {
      const game = dataset.games.find((g) => g.id === item.gameId)!;
      return canonicalPosition(
        schoolPosition(game, item.before),
        decodeMoves(game.moves)[item.before]!.color,
      );
    };
    const training = new Set([...ALL_EXERCISES, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
    const exams = RANK_FORMS.flatMap((form) => form.items.map((item) => key(item.exercise)));
    expect(exams).toHaveLength(128);
    expect(exams.filter((k) => training.has(k))).toEqual([]);
    expect(new Set(exams).size).toBe(128);
  });
  it('prouve les réponses locales sur les kifus et vérifie le coup et les variantes des questions stratégiques', () => {
    for (const item of RANK_FORMS.flatMap((form) => form.items)) {
      const { exercise: ex } = item;
      const g = game(item);
      expect(g.sources.length).toBeGreaterThan(0);
      expect(g.imported).not.toBe(true);
      expect(decodeMoves(g.moves)[ex.before]?.color, ex.id).toBe(ex.color);
      const board = schoolPosition(g, ex.before);
      if (item.kind === 'strategy') {
        const strategic = item.exercise;
        expect(decodeMoves(g.moves)[ex.before]!.point).toBe(strategic.historical);
        for (const point of [strategic.historical, ...strategic.alternatives])
          expect(
            board.clone().play(ex.color, point).illegal,
            `${ex.id}:${pointToHuman(point)}`,
          ).toBeUndefined();
      } else {
        expect(gradeRule(item, g, correctAnswer(item)), ex.id).toEqual({
          kind: 'rule',
          correct: true,
        });
        expect(gradeRule(item, g, null), ex.id).toEqual({ kind: 'rule', correct: false });
      }
    }
  });
  it('interdit les reprises et les modifications, exige deux dates distinctes, refuse les épreuves incomplètes et garde le niveau non calibré', () => {
    const [a, b, c, d] = RANK_FORMS.filter((f) => f.band === 'initiation') as [
      RankForm,
      RankForm,
      RankForm,
      RankForm,
    ];
    let progress = emptyRankProgress();
    const day = 20_000;
    expect(rankNextBand(RANK_FORMS, progress)).toBe('initiation');
    progress = startRankAttempt(progress, a, day);
    expect(startRankAttempt(progress, b, day)).toBe(progress);
    expect(finishRankAttempt(progress, a, day, [])).toBe(progress);
    progress = answerRankItem(progress, a, 0, correctAnswer(a.items[0]!));
    expect(answerRankItem(progress, a, 0, null)).toBe(progress);
    expect(answerRankItem(progress, a, 2, null)).toBe(progress);
    progress = abandonRankAttempt(progress, day);
    expect(startRankAttempt(progress, a, day)).toBe(progress);
    expect(nextRankForm(RANK_FORMS, progress, 'initiation')?.id).toBe(b.id);
    progress = pass(progress, b, day, 1);
    expect(rankBandEvidence(RANK_FORMS, progress, 'initiation')).toMatchObject({
      passed: 1,
      validated: false,
    });
    progress = pass(progress, c, day, 0);
    expect(rankBandEvidence(RANK_FORMS, progress, 'initiation')).toMatchObject({
      passed: 1,
      validated: false,
    });
    progress = pass(progress, d, day + 1, 1);
    expect(rankBandEvidence(RANK_FORMS, progress, 'initiation')).toMatchObject({
      passed: 2,
      validated: true,
    });
    expect(rankNextBand(RANK_FORMS, progress)).toBe('reading');
    expect(nextRankForm(RANK_FORMS, progress, 'initiation')).toBeUndefined();
    expect(decodeRankProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
    expect(validateRankProgress(progress, RANK_FORMS, dataset.games)).toBe(true);
    const corrupt = structuredClone(progress);
    const completed = corrupt.attempts.find((attempt) => attempt.graded)!;
    completed.graded![1]!.correct = !completed.graded![1]!.correct;
    expect(validateRankProgress(corrupt, RANK_FORMS, dataset.games)).toBe(false);
    expect(
      decodeRankProgress({ version: 1, attempts: [...progress.attempts, progress.attempts[0]] }),
    ).toBeNull();
    const failed = pass(emptyRankProgress(), a, day, 2);
    expect(rankBandEvidence(RANK_FORMS, failed, 'initiation').passed).toBe(0);
  });
  it('préserve l’évaluation à travers les exercices scolaires, export/décodage v1 et une vraie restauration de session de compte', async () => {
    const form = RANK_FORMS[0]!;
    const assessment = answerRankItem(
      startRankAttempt(emptyRankProgress(), form, 20_000),
      form,
      0,
      correctAnswer(form.items[0]!),
    );
    const base = { ...emptySchoolProgress(), assessment };
    const id = ALL_EXERCISES[0]!.id;
    const failed = markSchoolFailure(base, id, 20_000);
    expect(failed.assessment).toEqual(assessment);
    const school = recordSchool(failed, id, 'exact', 20_000);
    expect(school.assessment).toEqual(assessment);
    expect(decodeSchoolProgress(JSON.stringify(school))).toEqual(school);
    expect(decodeSchoolProgress(JSON.stringify(emptySchoolProgress()))).toEqual(
      emptySchoolProgress(),
    );
    expect(
      decodeSchoolProgress(JSON.stringify({ ...school, assessment: { version: 3 } })),
    ).toBeNull();
    const entries: ProgressEntry[] = [];
    const backend: ProgressBackend = {
      read: () => Promise.resolve(entries),
      write: (space, value, revision) => {
        entries.push({ space, value, revision: revision + 1 });
        return Promise.resolve(revision + 1);
      },
    };
    const prior = progressSession();
    try {
      const one = await AccountPersistence.connected(backend);
      setProgressSession(one);
      expect(saveSchoolProgress(school)).toBe(true);
      await one.flush();
      setProgressSession(await AccountPersistence.connected(backend));
      expect(loadSchoolProgress()).toEqual(school);
      setProgressSession(AccountPersistence.visitor());
      expect(loadSchoolProgress()).toEqual(emptySchoolProgress());
    } finally {
      setProgressSession(prior);
    }
  });
});
