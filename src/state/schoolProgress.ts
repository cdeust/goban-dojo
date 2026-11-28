import {
  emptySchoolProgress,
  type SchoolProgress,
  type SchoolRecord,
} from '../domain/schoolProgress.ts';
import { decodeRankProgress } from '../domain/rankAssessment.ts';
import { MASTERY } from '../domain/practice.ts';
import { progressSession } from './sessionProgress.ts';
const int = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
export function decodeSchoolProgress(raw: string): SchoolProgress | null {
  if (raw.length > 1_000_000) return null;
  try {
    const parsed = JSON.parse(raw) as SchoolProgress;
    if (parsed?.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > 10_000)
      return null;
    const seen = new Set<string>();
    const records: SchoolRecord[] = [];
    for (const r of parsed.records) {
      if (
        !r ||
        typeof r.id !== 'string' ||
        r.id.length > 100 ||
        !/^[-a-z]+:s\d+:\d+$/.test(r.id) ||
        seen.has(r.id) ||
        typeof r.firstTry !== 'boolean' ||
        !['exact', 'assisted', 'shown', 'incomplete'].includes(r.last) ||
        !int(r.stage, 0, MASTERY) ||
        !int(r.due, 0, 100_000)
      )
        return null;
      seen.add(r.id);
      records.push({ id: r.id, firstTry: r.firstTry, last: r.last, stage: r.stage, due: r.due });
    }
    const assessment =
      parsed.assessment === undefined ? undefined : decodeRankProgress(parsed.assessment);
    if (assessment === null) return null;
    return { version: 1, records, ...(assessment === undefined ? {} : { assessment }) };
  } catch {
    return null;
  }
}
export function loadSchoolProgress(): SchoolProgress {
  try {
    const raw = progressSession().read('school');
    return raw ? (decodeSchoolProgress(raw) ?? emptySchoolProgress()) : emptySchoolProgress();
  } catch {
    return emptySchoolProgress();
  }
}
export function saveSchoolProgress(progress: SchoolProgress): boolean {
  try {
    return progressSession().write('school', JSON.stringify(progress));
  } catch {
    return false;
  }
}
