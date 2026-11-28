/** Freeze a versioned, disjoint historical bank; do not regenerate distributed forms on ordinary builds. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { extractSchools } from '../src/domain/school.ts';
import { extractAdvancedTactics } from '../src/domain/advancedTactics.ts';
import { extractEndgame } from '../src/domain/endgameCourse.ts';
import { extractStrategyCourse } from '../src/story/strategyCourse.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';
import {
  FORMS_PER_BAND,
  RANK_BANDS,
  type RankForm,
  type RankItem,
} from '../src/domain/rankAssessment.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { schoolPosition } from '../src/domain/school.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const training = ['school', 'advanced', 'strategy', 'endgame'].flatMap(
  (name) =>
    JSON.parse(readFileSync(join(root, `src/story/${name}Catalog.json`), 'utf8')) as {
      gameId: string;
      before: number;
    }[],
);
const extraTraining = process.argv
  .slice(2)
  .flatMap(
    (file) => JSON.parse(readFileSync(file, 'utf8')) as { gameId: string; before: number }[],
  );
const used = new Set(
  [...training, ...extraTraining, ...LESSONS, ...OPENING_CASE_POSITIONS].map((e) => e.gameId),
);
const catalogGames = new Map(data.games.map((game) => [game.id, game]));
function positionKey(item: { gameId: string; before: number }) {
  const game = catalogGames.get(item.gameId);
  const move = game && decodeMoves(game.moves)[item.before];
  if (!game || !move)
    throw new Error(`Position source introuvable : ${item.gameId}/${item.before}`);
  return canonicalPosition(schoolPosition(game, item.before), move.color);
}
const trainingKeys = new Set(
  [...training, ...extraTraining, ...LESSONS, ...OPENING_CASE_POSITIONS].map(positionKey),
);
const pool = data.games.filter((g) => !used.has(g.id));
const candidates: RankItem[] = [
  ...extractSchools(pool, 48).map((exercise): RankItem => ({ kind: 'school', exercise })),
  ...extractAdvancedTactics(pool).map((exercise): RankItem => ({ kind: 'tactic', exercise })),
  ...extractEndgame(pool, 64).map((exercise): RankItem => ({ kind: 'endgame', exercise })),
  ...[
    ...extractStrategyCourse(pool, 100),
    ...Array.from({ length: 5 }, (_, i) =>
      extractStrategyCourse(
        pool.filter((_, n) => n % 5 === i),
        80,
      ),
    ).flat(),
  ].map(
    ({
      id,
      module,
      gameId,
      before,
      color,
      anchors,
      historical,
      alternatives,
      prompt,
    }): RankItem => ({
      kind: 'strategy',
      exercise: { id, module, gameId, before, color, anchors, historical, alternatives, prompt },
    }),
  ),
];
// Each board shape can be assigned to only one question, even across source games/modules.
// Prioritize scarce modules before deduplication so common opening shapes cannot crowd them out.
const required = new Set<string>(RANK_BANDS.flatMap((band) => [...band.modules]));
const eligible = candidates.flatMap((item) => {
  if (!required.has(item.exercise.module)) return [];
  const key = positionKey(item.exercise);
  return trainingKeys.has(key) ? [] : [{ item, key }];
});
const counts = new Map<string, Set<string>>();
for (const { item, key } of eligible) {
  const found = counts.get(item.exercise.module) ?? new Set<string>();
  found.add(key);
  counts.set(item.exercise.module, found);
}
eligible.sort(
  (a, b) =>
    (counts.get(a.item.exercise.module)?.size ?? 0) -
    (counts.get(b.item.exercise.module)?.size ?? 0),
);
const uniqueKeys = new Set<string>();
const all = eligible.flatMap(({ item, key }) => {
  if (uniqueKeys.has(key)) return [];
  uniqueKeys.add(key);
  return [item];
});
const slots = RANK_BANDS.flatMap((band) =>
  Array.from({ length: FORMS_PER_BAND }, (_, i) => ({
    id: `${band.id}-${i + 1}`,
    band: band.id,
    modules: band.modules,
    slots: band.modules.map((module, index) => ({
      module,
      index,
      item: undefined as RankItem | undefined,
    })),
  })),
);
const wanted = slots
  .flatMap(({ slots }) => slots)
  .sort(
    (a, b) =>
      all.filter(({ exercise }) => exercise.module === a.module).length -
      all.filter(({ exercise }) => exercise.module === b.module).length,
  );
type Slot = (typeof wanted)[number];
const matched = new Map<string, Slot>();
function assign(slot: Slot, visited: Set<string>): boolean {
  for (const item of all.filter(({ exercise }) => exercise.module === slot.module)) {
    const gameId = item.exercise.gameId;
    if (used.has(gameId) || visited.has(gameId)) continue;
    visited.add(gameId);
    const occupied = matched.get(gameId);
    if (occupied && !assign(occupied, visited)) continue;
    matched.set(gameId, slot);
    slot.item = item;
    return true;
  }
  return false;
}
for (const slot of wanted)
  if (!assign(slot, new Set()))
    throw new Error(`No distinct historical bank assignment for ${slot.module}`);
const forms: RankForm[] = slots.map(({ id, band, slots }) => ({
  id,
  band,
  items: slots.sort((a, b) => a.index - b.index).map((slot) => slot.item!),
}));
const path = join(root, 'src/story/rankCatalog.json');
writeFileSync(
  path,
  await format(JSON.stringify(forms), { ...(await resolveConfig(path)), parser: 'json' }),
);
console.log(
  `${forms.length} formes, ${forms.flatMap((form) => form.items).length} positions de parties distinctes`,
);
