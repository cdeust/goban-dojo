import { type Color, POINTS, type Board } from './board.ts';
import type { GameRecord } from './game.ts';
import { exerciseAnswer, schoolPosition, type SchoolExercise } from './school.ts';
import { judgeAdvancedTactic, type AdvancedTacticExercise } from './advancedTactics.ts';
import { judgeEndgame, type EndgameExercise } from './endgameCourse.ts';

/** Objectifs de formation inspirés du Nihon Ki-in, pas des équivalences de classement. */
export const RANK_BANDS = [
  {
    id: 'initiation',
    label: 'Initiation',
    target: 'Objectif 21 kyū',
    modules: [
      'liberties',
      'capture-one',
      'capture-chain',
      'escape',
      'connect',
      'atari',
      'legality',
      'region-size',
    ],
  },
  {
    id: 'reading',
    label: 'Lecture de combat',
    target: 'Objectif 15–10 kyū',
    modules: [
      'double-atari',
      'capture-sequence',
      'legality',
      'two-eyes',
      'make-life',
      'false-eye',
      'fuseki',
      'approach',
    ],
  },
  {
    id: 'development',
    label: 'Développement',
    target: 'Objectif 7–5 kyū',
    modules: [
      'capture-sequence',
      'ladder',
      'snapback',
      'capture-race',
      'direction',
      'corner-response',
      'influence',
      'yose-prisoners',
    ],
  },
  {
    id: 'advanced',
    label: 'Préparation supérieure',
    target: 'Vers 3–1 kyū puis 1er dan',
    modules: [
      'ladder',
      'capture-race',
      'direction',
      'influence',
      'reduction',
      'initiative',
      'yose-value',
      'yose-count',
    ],
  },
] as const;
export type RankBand = (typeof RANK_BANDS)[number]['id'];
export const QUESTIONS_PER_FORM = 8;
export const PASS_COUNT = 7;
export const FORMS_PER_BAND = 4;
export const REQUIRED_DAYS = 2;

interface StrategyItem {
  id: string;
  module: string;
  gameId: string;
  before: number;
  color: Color;
  anchors: number[];
  historical: number;
  alternatives: number[];
  prompt: string;
}
export type RankItem =
  | { kind: 'school'; exercise: SchoolExercise }
  | { kind: 'tactic'; exercise: AdvancedTacticExercise }
  | { kind: 'endgame'; exercise: EndgameExercise }
  | { kind: 'strategy'; exercise: StrategyItem };
export interface RankForm {
  id: string;
  band: RankBand;
  items: RankItem[];
}
/** null means voluntarily skipped. A submitted response is immutable. */
export type RankAnswer = number | boolean | null;
export type RankGrade =
  { correct: boolean; kind: 'rule' } | { correct: boolean; kind: 'estimate'; loss: number | null };
export interface RankAttempt {
  formId: string;
  started: number;
  status: 'active' | 'abandoned' | 'completed';
  answers: RankAnswer[];
  graded?: RankGrade[];
  ended?: number;
}
export interface RankProgress {
  version: 1;
  attempts: RankAttempt[];
}
export const emptyRankProgress = (): RankProgress => ({ version: 1, attempts: [] });
export function activeRankAttempt(progress: RankProgress): RankAttempt | undefined {
  return progress.attempts.find((attempt) => attempt.status === 'active');
}
export function nextRankForm(forms: readonly RankForm[], progress: RankProgress, band: RankBand) {
  return forms.find(
    (form) =>
      form.band === band && !progress.attempts.some((attempt) => attempt.formId === form.id),
  );
}
export function startRankAttempt(
  progress: RankProgress,
  form: RankForm,
  day: number,
): RankProgress {
  if (activeRankAttempt(progress) || progress.attempts.some((a) => a.formId === form.id))
    return progress;
  return {
    version: 1,
    attempts: [
      ...progress.attempts,
      { formId: form.id, started: day, status: 'active', answers: [] },
    ],
  };
}
export function validRankAnswer(item: RankItem, answer: RankAnswer): boolean {
  if (answer === null) return true;
  const { exercise: ex } = item;
  if (item.kind === 'school' && ex.module === 'legality') return typeof answer === 'boolean';
  if (item.kind === 'tactic' && ex.module === 'two-eyes') return typeof answer === 'boolean';
  if (item.kind === 'endgame')
    return (
      typeof answer === 'number' && item.exercise.choices.some((choice) => choice.value === answer)
    );
  if (item.kind === 'school' && ex.module === 'region-border')
    return typeof answer === 'number' && [1, 2, 3].includes(answer);
  if (item.kind === 'school' && (ex.module === 'liberties' || ex.module === 'region-size'))
    return (
      typeof answer === 'number' && Number.isSafeInteger(answer) && answer >= 0 && answer <= POINTS
    );
  return (
    typeof answer === 'number' && Number.isSafeInteger(answer) && answer >= 0 && answer < POINTS
  );
}
function update(progress: RankProgress, attempt: RankAttempt): RankProgress {
  return {
    version: 1,
    attempts: progress.attempts.map((a) => (a.formId === attempt.formId ? attempt : a)),
  };
}
export function answerRankItem(
  progress: RankProgress,
  form: RankForm,
  index: number,
  value: RankAnswer,
): RankProgress {
  const active = activeRankAttempt(progress);
  if (
    !active ||
    active.formId !== form.id ||
    index !== active.answers.length ||
    !form.items[index] ||
    !validRankAnswer(form.items[index]!, value)
  )
    return progress;
  return update(progress, { ...active, answers: [...active.answers, value] });
}
export function abandonRankAttempt(progress: RankProgress, day: number): RankProgress {
  const active = activeRankAttempt(progress);
  return active
    ? update(progress, { ...active, status: 'abandoned', ended: Math.max(active.started, day) })
    : progress;
}
export function exactRankGrade(
  item: Exclude<RankItem, { kind: 'strategy' }>,
  board: Board,
  answer: RankAnswer,
): RankGrade {
  return {
    kind: 'rule',
    correct:
      answer !== null &&
      (item.kind === 'school'
        ? exerciseAnswer(board, item.exercise, answer)
        : item.kind === 'tactic'
          ? judgeAdvancedTactic(board, item.exercise, answer)
          : judgeEndgame(item.exercise, answer).correct),
  };
}
export function gradeRule(
  item: Exclude<RankItem, { kind: 'strategy' }>,
  game: GameRecord,
  answer: RankAnswer,
): RankGrade {
  return exactRankGrade(item, schoolPosition(game, item.exercise.before), answer);
}
export function finishRankAttempt(
  progress: RankProgress,
  form: RankForm,
  day: number,
  grades: RankGrade[],
): RankProgress {
  const active = activeRankAttempt(progress);
  if (
    !active ||
    active.formId !== form.id ||
    active.answers.length !== form.items.length ||
    grades.length !== form.items.length ||
    !grades.every((grade, i) => validGrade(grade, form.items[i]!, active.answers[i]!))
  )
    return progress;
  return update(progress, {
    ...active,
    status: 'completed',
    graded: [...grades],
    ended: Math.max(active.started, day),
  });
}
function validGrade(grade: RankGrade, item: RankItem, answer: RankAnswer): boolean {
  if (typeof grade.correct !== 'boolean' || (answer === null && grade.correct)) return false;
  if (item.kind !== 'strategy') return grade.kind === 'rule';
  if (grade.kind !== 'estimate') return false;
  if (grade.loss === null) return !grade.correct;
  return (
    Number.isFinite(grade.loss) &&
    grade.loss >= 0 &&
    grade.loss <= 1000 &&
    grade.correct === grade.loss < 2
  );
}
export function rankPassed(form: RankForm, attempt: RankAttempt): boolean {
  return (
    attempt.status === 'completed' &&
    attempt.formId === form.id &&
    form.items.length === QUESTIONS_PER_FORM &&
    attempt.answers.length === form.items.length &&
    attempt.graded?.length === form.items.length &&
    attempt.answers.every((answer, i) => validRankAnswer(form.items[i]!, answer)) &&
    attempt.graded.every((grade, i) => validGrade(grade, form.items[i]!, attempt.answers[i]!)) &&
    attempt.graded.filter((g) => g.correct).length >= PASS_COUNT
  );
}
export function rankBandEvidence(
  forms: readonly RankForm[],
  progress: RankProgress,
  band: RankBand,
) {
  const completed = forms
    .filter((form) => form.band === band)
    .flatMap((form) => {
      const attempt = progress.attempts.find(
        (a) => a.formId === form.id && a.status === 'completed',
      );
      return attempt ? [{ form, attempt }] : [];
    });
  const days = new Set(
    completed
      .filter(({ form, attempt }) => rankPassed(form, attempt))
      .map(({ attempt }) => attempt.started),
  );
  return {
    passed: days.size,
    validated: days.size >= REQUIRED_DAYS,
    completed: completed.length,
    successfulDays: [...days],
  };
}
export function rankNextBand(
  forms: readonly RankForm[],
  progress: RankProgress,
): RankBand | undefined {
  // A higher diagnostic can place the learner directly; it does not retroactively validate earlier modules.
  const highest = RANK_BANDS.findLastIndex(
    (band) => rankBandEvidence(forms, progress, band.id).validated,
  );
  return RANK_BANDS[highest + 1]?.id;
}

/** The last completed assessment identifies skills worth revisiting, not a cause of low playing strength. */
export function rankLatestWeakModules(
  forms: readonly RankForm[],
  progress: RankProgress,
): string[] {
  const recent = progress.attempts
    .filter((attempt) => attempt.status === 'completed')
    .slice()
    .sort((a, b) => (a.ended ?? 0) - (b.ended ?? 0))
    .at(-1);
  const form = recent && forms.find((f) => f.id === recent.formId);
  if (!form || !recent?.graded) return [];
  return [
    ...new Set(
      form.items.flatMap((item, index) =>
        recent.graded?.[index]?.correct === false ? [item.exercise.module] : [],
      ),
    ),
  ];
}

/** Shape-only decoding. Catalogue reconciliation is performed when an assessment is read. */
const dayValid = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
const primitiveAnswer = (value: unknown): value is RankAnswer =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 1000);
export function decodeRankProgress(value: unknown): RankProgress | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as RankProgress;
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.attempts) ||
    raw.attempts.length > RANK_BANDS.length * FORMS_PER_BAND
  )
    return null;
  const ids = new Set<string>();
  const attempts: RankAttempt[] = [];
  let activeCount = 0;
  for (const a of raw.attempts) {
    if (
      !a ||
      typeof a.formId !== 'string' ||
      !/^(initiation|reading|development|advanced)-[1-4]$/.test(a.formId) ||
      ids.has(a.formId) ||
      !dayValid(a.started) ||
      !['active', 'abandoned', 'completed'].includes(a.status) ||
      !Array.isArray(a.answers) ||
      a.answers.length > QUESTIONS_PER_FORM ||
      !a.answers.every(primitiveAnswer)
    )
      return null;
    const attempt: RankAttempt = {
      formId: a.formId,
      started: a.started,
      status: a.status,
      answers: [...a.answers],
    };
    ids.add(a.formId);
    if (a.status === 'active') {
      if (++activeCount > 1 || a.ended !== undefined || a.graded !== undefined) return null;
    } else if (!dayValid(a.ended) || a.ended < a.started) return null;
    else attempt.ended = a.ended;
    if (a.status === 'completed') {
      if (
        a.answers.length !== QUESTIONS_PER_FORM ||
        !Array.isArray(a.graded) ||
        a.graded.length !== QUESTIONS_PER_FORM
      )
        return null;
      const grades: RankGrade[] = [];
      for (const grade of a.graded) {
        if (!grade || typeof grade.correct !== 'boolean') return null;
        if (grade.kind === 'rule') grades.push({ kind: 'rule', correct: grade.correct });
        else if (
          grade.kind === 'estimate' &&
          (grade.loss === null ||
            (Number.isFinite(grade.loss) && grade.loss >= 0 && grade.loss <= 1000))
        )
          grades.push({ kind: 'estimate', loss: grade.loss, correct: grade.correct });
        else return null;
      }
      attempt.graded = grades;
    } else if (a.graded !== undefined) return null;
    attempts.push(attempt);
  }
  return { version: 1, attempts };
}
export function validateRankProgress(
  progress: RankProgress,
  forms: readonly RankForm[],
  games?: readonly GameRecord[],
): boolean {
  return progress.attempts.every((attempt) => {
    const form = forms.find((f) => f.id === attempt.formId);
    return (
      form &&
      attempt.answers.length <= form.items.length &&
      attempt.answers.every((answer, i) => validRankAnswer(form.items[i]!, answer)) &&
      (!attempt.graded ||
        attempt.graded.every((grade, i) => {
          const item = form.items[i]!;
          const answer = attempt.answers[i]!;
          if (!validGrade(grade, item, answer)) return false;
          if (!games || item.kind === 'strategy') return true;
          const game = games.find((g) => g.id === item.exercise.gameId);
          return !!game && gradeRule(item, game, answer).correct === grade.correct;
        }))
    );
  });
}
