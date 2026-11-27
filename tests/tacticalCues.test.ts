import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { pointFromHuman } from '../src/domain/board.ts';
import type { Dataset } from '../src/domain/game.ts';
import { timelineOf, useStore } from '../src/state/store.ts';
import { parseTacticalCueKey, tacticalCueKey } from '../src/state/tacticalCues.ts';

const dataset = JSON.parse(
  readFileSync(join(import.meta.dirname, '../public/data/games.json'), 'utf8'),
) as Dataset;
const snapshot = useStore.getState();

it('distingue la pierre capturée du coup étudié et choisit un seul halo par intersection', () => {
  const marks = parseTacticalCueKey(
    tacticalCueKey({ ...snapshot, dataset, mode: 'etudier', move: 84, studyMove: 84 }),
  );
  expect(marks).toContainEqual({ point: pointFromHuman('P13'), kind: 'capture' });
  expect(marks).toContainEqual({ point: pointFromHuman('O13'), kind: 'studyMove' });
  expect(new Set(marks.map(({ point }) => point)).size).toBe(marks.length);
});

it('signale K11 quand la suite reflète le kifu, pas dans une variante distincte', () => {
  const gameIndex = dataset.games.findIndex(({ id }) => id === 's126');
  const historicalMove = timelineOf(dataset.games[gameIndex]!).moves[126]!;
  const state = {
    ...snapshot,
    dataset,
    gameIndex,
    mode: 'reflechir' as const,
    move: 126,
    variation: [historicalMove],
  };
  const mark = { point: pointFromHuman('K11'), kind: 'landmark' };
  expect(parseTacticalCueKey(tacticalCueKey(state))).toContainEqual(mark);
  const other = { ...state, variation: [{ color: 'B' as const, point: pointFromHuman('G4')! }] };
  expect(parseTacticalCueKey(tacticalCueKey(other))).not.toContainEqual(mark);
  expect(tacticalCueKey({ ...state, effects: false })).toBe('');
});

it('identifie la seule pierre hypothétique visible pendant une simulation', () => {
  const gameIndex = dataset.games.findIndex(({ id }) => id === 's126');
  const point = pointFromHuman('G4')!;
  const state = {
    ...snapshot,
    dataset,
    gameIndex,
    move: 126,
    reflectionReplay: 'manual' as const,
    variation: [{ color: 'B' as const, point }],
  };
  expect(parseTacticalCueKey(tacticalCueKey(state))).toEqual([{ point, kind: 'variation' }]);
  expect(tacticalCueKey({ ...state, effects: false })).toBe('');
});
