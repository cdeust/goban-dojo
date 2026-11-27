import type { ProgressSpace } from './accountPersistence.ts';
import { decodeSchoolProgress } from './schoolProgress.ts';
import { decodePractice } from './practice.ts';
import { decodeTrainingSession } from './trainingGame.ts';
import { importSgf } from '../domain/importSgf.ts';

const LEGACY_KEYS: Record<ProgressSpace, string> = {
  school: 'goban-dojo:school:v1',
  practice: 'goban-dojo:practice',
  training: 'goban-dojo.training-game.v1',
  history: 'goban-dojo.training-history.v1',
  imports: 'goban.imports.v1',
};

/** Anciennes sauvegardes, jamais lues ou transférées automatiquement pour un visiteur. */
export function legacyProgress(
  storage: Pick<Storage, 'getItem'>,
): Partial<Record<ProgressSpace, string>> {
  const result: Partial<Record<ProgressSpace, string>> = {};
  for (const space of Object.keys(LEGACY_KEYS) as ProgressSpace[]) {
    const raw = storage.getItem(LEGACY_KEYS[space]);
    if (!raw || raw.length > 8_000_000) continue;
    try {
      if (space === 'school') {
        const value = decodeSchoolProgress(raw);
        if (value?.records.length) result.school = JSON.stringify(value);
      } else if (space === 'practice') {
        const value = decodePractice(raw);
        if (value.cards.length || value.days.length) result.practice = JSON.stringify(value);
      } else if (space === 'training') {
        const value = decodeTrainingSession(raw);
        if (value) result.training = JSON.stringify(value);
      } else if (space === 'history') {
        const values: unknown = JSON.parse(raw);
        if (!Array.isArray(values)) continue;
        const valid = values.flatMap((item) => {
          const value = decodeTrainingSession(JSON.stringify(item));
          return value?.game.result ? [value] : [];
        });
        if (valid.length) result.history = JSON.stringify(valid);
      } else if (space === 'imports') {
        const values: unknown = JSON.parse(raw);
        if (!Array.isArray(values)) continue;
        const valid = values.filter((item: unknown) => {
          if (
            !item ||
            typeof item !== 'object' ||
            !('id' in item) ||
            !('name' in item) ||
            !('text' in item)
          )
            return false;
          if (
            typeof item.id !== 'string' ||
            !item.id.startsWith('local-') ||
            typeof item.name !== 'string' ||
            typeof item.text !== 'string'
          )
            return false;
          try {
            importSgf(item.text, item.id, item.name);
            return true;
          } catch {
            return false;
          }
        });
        if (valid.length) result.imports = JSON.stringify(valid);
      }
    } catch {
      /* Ignore a corrupt legacy space, keeping the original intact. */
    }
  }
  return result;
}
