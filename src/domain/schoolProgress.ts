import { REVIEW_INTERVALS, MASTERY } from './practice.ts';
import { SCHOOL_MODULES, type SchoolExercise } from './school.ts';
export interface CourseActivity {
  id: string;
  module: string;
}
export interface CourseModule {
  id: string;
  level: number;
}

export type SchoolGrade = 'exact' | 'assisted' | 'shown';
export interface SchoolRecord {
  id: string;
  firstTry: boolean;
  last: SchoolGrade | 'incomplete';
  stage: number;
  due: number;
}
export interface SchoolProgress {
  version: 1;
  records: SchoolRecord[];
}
export const emptySchoolProgress = (): SchoolProgress => ({ version: 1, records: [] });
export const schoolRecord = (progress: SchoolProgress, id: string) =>
  progress.records.find((r) => r.id === id);

/** Le transfert au premier essai reste distinct des rappels ultérieurs et de l’XP du kifu. */
export function recordSchool(
  progress: SchoolProgress,
  id: string,
  result: SchoolGrade,
  today: number,
): SchoolProgress {
  const old = schoolRecord(progress, id);
  if (old && old.due > today) return progress;
  const stage = result === 'exact' ? Math.min(MASTERY, (old?.stage ?? 0) + 1) : 0;
  const next: SchoolRecord = {
    id,
    firstTry: old?.firstTry ?? result === 'exact',
    last: result,
    stage,
    due: today + REVIEW_INTERVALS[stage]!,
  };
  if (old) return { version: 1, records: progress.records.map((r) => (r.id === id ? next : r)) };
  return { version: 1, records: [...progress.records, next] };
}

/** Un premier échec ou indice reste enregistré même si le joueur abandonne la session. */
export function markSchoolFailure(
  progress: SchoolProgress,
  id: string,
  today: number,
): SchoolProgress {
  if (schoolRecord(progress, id)) return progress;
  return {
    version: 1,
    records: [
      ...progress.records,
      { id, firstTry: false, last: 'incomplete', stage: 0, due: today },
    ],
  };
}

export function moduleProgress(
  exercises: readonly CourseActivity[],
  progress: SchoolProgress,
  module: string,
  today: number,
) {
  const records = exercises
    .filter((e) => e.module === module)
    .flatMap((e) => {
      const item = schoolRecord(progress, e.id);
      return item ? [item] : [];
    });
  return {
    attempted: records.length,
    firstTry: records.filter((r) => r.firstTry).length,
    exact: records.filter((r) => r.last === 'exact').length,
    due: records.filter((r) => r.due <= today).length,
  };
}

/** Rappels dus d'abord, puis une position encore inconnue de la compétence la moins consolidée au niveau courant. */
export function recommendCourse<T extends CourseActivity>(
  exercises: readonly T[],
  progress: SchoolProgress,
  today: number,
  modules: readonly CourseModule[],
): T | undefined {
  const due = exercises
    .flatMap((exercise) => {
      const record = schoolRecord(progress, exercise.id);
      return record && record.due <= today ? [{ exercise, record }] : [];
    })
    .sort((a, b) => a.record.stage - b.record.stage || a.record.due - b.record.due);
  if (due[0]) return due[0].exercise;
  const categories = modules
    .map((module) => ({
      module,
      stats: moduleProgress(exercises, progress, module.id, today),
      next: exercises.find((e) => e.module === module.id && !schoolRecord(progress, e.id)),
    }))
    .filter((m) => m.next);
  const pending = categories.filter(
    (m) =>
      m.stats.exact <
      Math.min(12, Math.ceil(exercises.filter((e) => e.module === m.module.id).length / 2)),
  );
  // Un niveau est un objectif pédagogique, pas une barrière : tous les exercices restent disponibles.
  const ranked = (pending.length ? pending : categories).sort(
    (a, b) =>
      a.module.level - b.module.level ||
      a.stats.exact - b.stats.exact ||
      b.stats.attempted - b.stats.firstTry - (a.stats.attempted - a.stats.firstTry),
  );
  return ranked[0]?.next;
}

export function recommendSchool(
  exercises: readonly SchoolExercise[],
  progress: SchoolProgress,
  today: number,
): SchoolExercise | undefined {
  return recommendCourse(exercises, progress, today, SCHOOL_MODULES);
}
