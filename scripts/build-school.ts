/** Produit le catalogue d'exercices à partir du corpus historique déjà vérifié. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'prettier';
import { extractSchools, SCHOOL_MODULES } from '../src/domain/school.ts';
import type { Dataset } from '../src/domain/game.ts';
const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const items = extractSchools(data.games);
if (items.length !== SCHOOL_MODULES.length * 24) throw new Error('Catalogue incomplet');
const path = join(root, 'src/story/schoolCatalog.json');
writeFileSync(path, await format(JSON.stringify(items), { parser: 'json' }));
console.log(
  `${items.length} exercices, ${new Set(items.map((e) => e.gameId)).size} parties historiques`,
);
