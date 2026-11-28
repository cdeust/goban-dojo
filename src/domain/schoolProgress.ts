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
  const old = schoolRecord(progress, id);
  if (old && (old.due > today || old.last === 'incomplete')) return progress;
  if (old)
    return {
      version: 1,
      records: progress.records.map((record) =>
        record.id === id ? { ...record, last: 'incomplete', stage: 0, due: today } : record,
      ),
    };
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

/** Guided levels depend on distinct unaided successes, not XP or repeated attempts. */
export function coursePlan<T extends CourseActivity>(
  exercises: readonly T[],
  progress: SchoolProgress,
  today: number,
  modules: readonly CourseModule[],
) {
  const records = new Map(progress.records.map((record) => [record.id, record]));
  const due = exercises
    .flatMap((exercise) => {
      const record = records.get(exercise.id);
      return record && record.due <= today ? [{ exercise, record }] : [];
    })
    .sort((a, b) => a.record.stage - b.record.stage || a.record.due - b.record.due);
  const categories = modules.flatMap((module) => {
    const activities = exercises.filter((exercise) => exercise.module === module.id);
    if (!activities.length) return [];
    const stats = moduleProgress(exercises, progress, module.id, today);
    return [
      {
        module,
        stats,
        threshold: Math.min(12, Math.ceil(activities.length / 2)),
        next: activities.find((exercise) => !records.has(exercise.id)),
      },
    ];
  });
  const pending = categories.filter((category) => category.stats.exact < category.threshold);
  const level = pending.length
    ? Math.min(...pending.map((category) => category.module.level))
    : Math.max(1, ...categories.map((category) => category.module.level));
  const candidates = pending.length
    ? pending.filter((category) => category.module.level === level)
    : categories;
  const ranked = candidates
    .filter((category) => category.next)
    .sort(
      (a, b) =>
        a.module.level - b.module.level ||
        a.stats.exact - b.stats.exact ||
        b.stats.attempted - b.stats.firstTry - (a.stats.attempted - a.stats.firstTry),
    );
  return {
    level,
    due: due.length,
    review: due[0]?.exercise,
    next: due[0]?.exercise ?? ranked[0]?.next,
  };
}

/** Due reviews first, then a new exercise at the actual learner level. */
export function recommendCourse<T extends CourseActivity>(
  exercises: readonly T[],
  progress: SchoolProgress,
  today: number,
  modules: readonly CourseModule[],
): T | undefined {
  return coursePlan(exercises, progress, today, modules).next;
}

export function recommendSchool(
  exercises: readonly SchoolExercise[],
  progress: SchoolProgress,
  today: number,
): SchoolExercise | undefined {
  return recommendCourse(exercises, progress, today, SCHOOL_MODULES);
}
