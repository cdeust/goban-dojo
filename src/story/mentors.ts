import type { GameRecord, ImportedGameRecord } from '../domain/game.ts';

export interface Mentor {
  key: string;
  name: string;
  games: { game: ImportedGameRecord; index: number }[];
}

const UNNAMED = new Set([
  'noir',
  'blanc',
  'black',
  'white',
  'unknown',
  'inconnu',
  'inconnue',
  'anonyme',
  'anonymous',
  'joueur noir',
  'joueur blanc',
  'black player',
  'white player',
]);

/** Les propriétés PB et PW des fichiers importés sont la seule source de cette chronologie. */
export function mentorsOf(games: readonly GameRecord[]): Mentor[] {
  const mentors = new Map<string, Mentor>();
  for (const [index, game] of games.entries()) {
    if (!game.imported) continue;
    for (const raw of [game.black, game.white]) {
      const name = raw.trim().replace(/\s+/gu, ' ').normalize('NFC');
      const key = name.toLowerCase();
      if (!/[\p{L}\p{N}]/u.test(name) || UNNAMED.has(key)) continue;
      const mentor: Mentor = mentors.get(key) ?? { key, name, games: [] };
      if (mentor.games.at(-1)?.game !== game) mentor.games.push({ game, index });
      mentors.set(key, mentor);
    }
  }
  for (const mentor of mentors.values()) {
    mentor.games.sort(({ game: a }, { game: b }) =>
      a.date && b.date
        ? a.date.localeCompare(b.date)
        : Number(Boolean(b.date)) - Number(Boolean(a.date)),
    );
  }
  return [...mentors.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
