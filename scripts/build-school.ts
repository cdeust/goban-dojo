/** Produit les catalogues d'exercices à partir du corpus historique déjà vérifié. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { extractSchools, SCHOOL_MODULES } from '../src/domain/school.ts';
import { extractAdvancedTactics, ADVANCED_TACTICS_MODULES } from '../src/domain/advancedTactics.ts';
import { extractEndgame, ENDGAME_MODULES } from '../src/domain/endgameCourse.ts';
import { extractStrategyCourse, STRATEGY_MODULES } from '../src/story/strategyCourse.ts';
import type { Dataset } from '../src/domain/game.ts';
const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const catalogs = [
  {
    filename: 'schoolCatalog.json',
    items: extractSchools(data.games),
    expected: SCHOOL_MODULES.length * 24,
  },
  {
    filename: 'advancedCatalog.json',
    items: extractAdvancedTactics(data.games),
    expected: ADVANCED_TACTICS_MODULES.length * 24,
  },
  {
    filename: 'strategyCatalog.json',
    items: extractStrategyCourse(data.games),
    expected: STRATEGY_MODULES.length * 12,
  },
  {
    filename: 'endgameCatalog.json',
    items: extractEndgame(data.games),
    expected: ENDGAME_MODULES.length * 32,
  },
] as const;
for (const catalog of catalogs) {
  if (catalog.items.length !== catalog.expected)
    throw new Error(`Catalogue incomplet : ${catalog.filename}`);
  const path = join(root, 'src/story', catalog.filename);
  writeFileSync(
    path,
    await format(JSON.stringify(catalog.items), { ...(await resolveConfig(path)), parser: 'json' }),
  );
}
const all = catalogs.flatMap((c) => [...c.items]);
if (new Set(all.map((e) => e.id)).size !== all.length)
  throw new Error('Identifiants de cours dupliqués');
console.log(
  `${all.length} exercices et études, ${new Set(all.map((e) => e.gameId)).size} parties historiques`,
);
