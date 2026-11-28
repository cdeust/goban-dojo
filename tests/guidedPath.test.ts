import { describe, expect, it } from 'vitest';
import {
  coursePlan,
  emptySchoolProgress,
  markSchoolFailure,
  recordSchool,
} from '../src/domain/schoolProgress.ts';
import { emptyPractice, recordRecall } from '../src/domain/practice.ts';
import { FIRST_LESSON, LESSONS, recommendedLesson } from '../src/story/lessons.ts';

const modules = [
  { id: 'liberties', level: 1 },
  { id: 'capture', level: 1 },
  { id: 'connection', level: 2 },
];
const exercises = [
  { id: 'l1', module: 'liberties' },
  { id: 'l2', module: 'liberties' },
  { id: 'c1', module: 'capture' },
  { id: 'c2', module: 'capture' },
  { id: 'n1', module: 'connection' },
];
const day = 20_000;

describe('parcours guidé fondé sur les acquis', () => {
  it('valide chaque compétence du niveau avant de progresser, même si le niveau supérieur est accessible librement', () => {
    const blank = emptySchoolProgress();
    expect(coursePlan(exercises, blank, day, modules)).toMatchObject({
      level: 1,
      next: { id: 'l1' },
      due: 0,
    });
    const known = recordSchool(blank, 'l1', 'exact', day);
    expect(coursePlan(exercises, known, day, modules)).toMatchObject({
      level: 1,
      next: { id: 'c1' },
    });
    const further = recordSchool(known, 'c1', 'exact', day);
    expect(coursePlan(exercises, further, day, modules)).toMatchObject({
      level: 2,
      next: { id: 'n1' },
    });
    expect(coursePlan(exercises, further, day + 1, modules)).toMatchObject({
      level: 2,
      due: 2,
      review: { id: 'l1' },
    });
    const struggling = recordSchool(recordSchool(known, 'c1', 'shown', day), 'c2', 'assisted', day);
    expect(coursePlan(exercises, struggling, day, modules)).toMatchObject({
      level: 1,
      next: undefined,
    });
    expect(coursePlan(exercises, struggling, day + 1, modules)).toMatchObject({
      level: 1,
      review: { id: 'c1' },
    });
  });
  it('une révision échouée fait revenir à la compétence fragile avant de monter en difficulté', () => {
    const solved = recordSchool(
      recordSchool(emptySchoolProgress(), 'l1', 'exact', day),
      'c1',
      'exact',
      day,
    );
    const failed = markSchoolFailure(solved, 'l1', day + 1);
    expect(coursePlan(exercises, failed, day + 1, modules)).toMatchObject({
      level: 1,
      review: { id: 'l1' },
    });
    expect(failed.records.find((r) => r.id === 'l1')).toMatchObject({
      stage: 0,
      firstTry: true,
      last: 'incomplete',
    });
  });
  it('les micro-leçons utilisent les cartes du carnet et ne proposent pas une difficulté supérieure non acquise', () => {
    const failed = recordRecall(
      emptyPractice(),
      FIRST_LESSON.gameId,
      FIRST_LESSON.before,
      'shown',
      day,
    );
    const other = LESSONS[1]!;
    const both = recordRecall(failed, other.gameId, other.before, 'assisted', day);
    expect(recommendedLesson(failed, day)).toBe(other);
    expect(recommendedLesson(both, day)).toBeUndefined();
    expect(recommendedLesson(both, day + 1)).toBe(FIRST_LESSON);
    const solved = recordRecall(both, FIRST_LESSON.gameId, FIRST_LESSON.before, 'exact', day + 1);
    expect(recommendedLesson(solved, day + 1)).toBe(other);
  });
});
