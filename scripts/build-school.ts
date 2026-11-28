/** Produit les catalogues d'exercices à partir du corpus historique déjà vérifié. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { extractSchools, SCHOOL_MODULES } from '../src/domain/school.ts';
import { extractAdvancedTactics, ADVANCED_TACTICS_MODULES } from '../src/domain/advancedTactics.ts';
import { extractEndgame, ENDGAME_MODULES } from '../src/domain/endgameCourse.ts';
import { extractStrategyCourse, STRATEGY_MODULES } from '../src/story/strategyCourse.ts';
import {
  courseSupplement,
  interleaveSupplement,
  EXTRA_SHARED,
  EXTRA_MIXED,
  EXTRA_BRIDGE_PER_MODULE,
} from './course-supplement.ts';
import { BRIDGE_MODULES } from '../src/story/strategyCourse.ts';
import type { RankForm } from '../src/domain/rankAssessment.ts';
import type { Dataset } from '../src/domain/game.ts';
const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const school = extractSchools(data.games);
const advanced = extractAdvancedTactics(data.games);
const strategy = extractStrategyCourse(data.games);
const endgame = extractEndgame(data.games);
const exams = (
  JSON.parse(readFileSync(join(root, 'src/story/rankCatalog.json'), 'utf8')) as RankForm[]
).flatMap((form) => form.items.map((item) => item.exercise));
const extra = courseSupplement(
  data.games,
  [...school, ...advanced, ...strategy, ...endgame],
  exams,
);
const catalogs = [
  {
    filename: 'schoolCatalog.json',
    items: interleaveSupplement(school, extra.school, 2),
    expected: SCHOOL_MODULES.length * 24 + EXTRA_SHARED + EXTRA_MIXED,
  },
  {
    filename: 'advancedCatalog.json',
    items: advanced,
    expected: ADVANCED_TACTICS_MODULES.length * 24,
  },
  {
    filename: 'strategyCatalog.json',
    items: interleaveSupplement(strategy, extra.strategy, 3),
    expected: STRATEGY_MODULES.length * 12 + BRIDGE_MODULES.length * EXTRA_BRIDGE_PER_MODULE,
  },
  {
    filename: 'endgameCatalog.json',
    items: endgame,
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
