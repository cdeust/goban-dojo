/** Freeze a versioned, disjoint historical bank; do not regenerate distributed forms on ordinary builds. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { extractSchools } from '../src/domain/school.ts';
import { extractAdvancedTactics } from '../src/domain/advancedTactics.ts';
import { extractEndgame } from '../src/domain/endgameCourse.ts';
import { extractStrategyCourse } from '../src/story/strategyCourse.ts';
import { LESSONS } from '../src/story/lessons.ts';
import {
  FORMS_PER_BAND,
  RANK_BANDS,
  type RankForm,
  type RankItem,
} from '../src/domain/rankAssessment.ts';
import type { Dataset } from '../src/domain/game.ts';
const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const training = ['school', 'advanced', 'strategy', 'endgame'].flatMap(
  (name) =>
    JSON.parse(readFileSync(join(root, `src/story/${name}Catalog.json`), 'utf8')) as {
      gameId: string;
    }[],
);
const extraTraining = process.argv
  .slice(2)
  .flatMap((file) => JSON.parse(readFileSync(file, 'utf8')) as { gameId: string }[]);
const used = new Set([...training, ...extraTraining, ...LESSONS].map((e) => e.gameId));
const pool = data.games.filter((g) => !used.has(g.id));
const all: RankItem[] = [
  ...extractSchools(pool, 48).map((exercise): RankItem => ({ kind: 'school', exercise })),
  ...extractAdvancedTactics(pool).map((exercise): RankItem => ({ kind: 'tactic', exercise })),
  ...extractEndgame(pool, 64).map((exercise): RankItem => ({ kind: 'endgame', exercise })),
  ...[
    ...extractStrategyCourse(pool, 30),
    ...Array.from({ length: 5 }, (_, i) =>
      extractStrategyCourse(
        pool.filter((_, n) => n % 5 === i),
        20,
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
