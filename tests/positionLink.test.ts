import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pointFromHuman } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { resolvePositionLink } from '../src/domain/positionLink.ts';
import { schoolPosition } from '../src/domain/school.ts';

const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;

describe('lien de position publique', () => {
  it('rejoue la position après J5 et autorise une alternative au coup 127', () => {
    const position = resolvePositionLink('?partie=s126&coup=126', games)!;
    const game = games[position.gameIndex]!;
    const moves = decodeMoves(game.moves);
    expect(moves[position.move - 1]).toEqual({ color: 'W', point: pointFromHuman('J5') });
    expect(moves[position.move]).toEqual({ color: 'B', point: pointFromHuman('K11') });
    const board = schoolPosition(game, position.move);
    expect(board.play('B', pointFromHuman('G4')!).captures).toEqual([pointFromHuman('G3')]);
    expect(board.stonesOf(pointFromHuman('G4')!)).toEqual(
      expect.arrayContaining([pointFromHuman('G5'), pointFromHuman('H4')]),
    );
  });

  it.each([
    '',
    '?partie=s126',
    '?coup=126',
    '?partie=absente&coup=126',
    '?partie=s126&partie=s001&coup=126',
    '?partie=s126&coup=126&coup=127',
    '?partie=s126&coup=126.1',
    '?partie=s126&coup=-1',
    '?partie=s126&coup=9999',
    '?partie=s126&coup=0x7e',
  ])('rejette le lien incomplet ou ambigu %s', (query) => {
    expect(resolvePositionLink(query, games)).toBeNull();
  });

  it('n’expose pas les parties personnelles et accepte le premier plateau', () => {
    const game = games.find((entry) => entry.id === 's126')!;
    const query = '?partie=s126&coup=0';
    expect(resolvePositionLink(query, [{ ...game, imported: true }])).toBeNull();
    expect(resolvePositionLink(query, [game])).toEqual({ gameIndex: 0, move: 0 });
  });
});
