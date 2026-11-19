import { importSgf } from '../domain/importSgf.ts';
import type { ImportedGameRecord } from '../domain/game.ts';

const STORAGE_KEY = 'goban.imports.v1';

interface LocalKifu {
  id: string;
  name: string;
  text: string;
}

function savedKifus(): LocalKifu[] {
  const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  if (!Array.isArray(saved)) return [];
  return saved.filter(
    (item: LocalKifu) =>
      typeof item?.id === 'string' &&
      item.id.startsWith('local-') &&
      typeof item.name === 'string' &&
      typeof item.text === 'string',
  );
}

export function localGames(): ImportedGameRecord[] {
  try {
    return savedKifus().flatMap(({ id, name, text }) => {
      try {
        return [importSgf(text, id, name)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveGame(text: string, name: string): ImportedGameRecord {
  const saved = savedKifus();
  const duplicate = saved.find((item) => item.text === text);
  if (duplicate) return importSgf(text, duplicate.id, duplicate.name);
  const id = 'local-' + crypto.randomUUID();
  const game = importSgf(text, id, name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved, { id, name, text }]));
  return game;
}
