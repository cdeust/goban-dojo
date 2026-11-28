import { readFileSync } from 'node:fs';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { pointToHuman } from '../src/domain/board.ts';
import { OPENING_CASE } from '../src/story/openingCases.ts';
import { expect, it } from 'vitest';
const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
it('deux parties authentiques rejoignent exactement le même goban avant des décisions différentes', () => {
  const a = data.games.find((g) => g.id === OPENING_CASE.first.gameId)!,
    b = data.games.find((g) => g.id === OPENING_CASE.second.gameId)!;
  const am = decodeMoves(a.moves),
    bm = decodeMoves(b.moves);
  expect(a.date).toBe('1843-05-24');
  expect(b.date).toBe('1843-07-18');
  expect(a.black).toBe(b.white);
  expect(a.white).toBe(b.black);
  expect(am.slice(0, 6)).not.toEqual(bm.slice(0, 6));
  expect(boardAt(decodePoints(a.setupBlack), am, 6).positionKey()).toBe(
    boardAt(decodePoints(b.setupBlack), bm, 6).positionKey(),
  );
  expect(am[6]?.color).toBe('B');
  expect(bm[6]?.color).toBe('B');
  expect(am.slice(6, 11).map((m) => pointToHuman(m.point))).toEqual([
    'P16',
    'C6',
    'D6',
    'D7',
    'E6',
  ]);
  expect(bm.slice(6, 11).map((m) => pointToHuman(m.point))).toEqual([
    'D5',
    'P17',
    'F4',
    'G3',
    'C11',
  ]);
});
