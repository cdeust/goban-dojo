import { describe, expect, it } from 'vitest';
import { importSgf } from '../src/domain/importSgf.ts';
import { decodeMoves, decodePoints } from '../src/domain/game.ts';
import { pointToHuman } from '../src/domain/board.ts';

describe('import SGF', () => {
  it('conserve joueurs, komi, handicap, passes et première variante', () => {
    const game = importSgf(
      '(;FF[4]GM[1]SZ[19]PB[Alice]PW[Émile]KM[6.5]DT[2026-10-19,20]HA[2]AB[dd][pp]RE[W+2.5];W[pd](;B[];W[dp])(;B[dc]))',
      'local-test',
      'Forum.sgf',
    );
    expect(game).toMatchObject({
      black: 'Alice',
      white: 'Émile',
      komi: 6.5,
      date: '2026-10-19',
      handicap: 2,
      event: 'Forum',
      imported: true,
      result: { winner: 'W', margin: 2.5 },
    });
    expect(decodePoints(game.setupBlack).map(pointToHuman)).toEqual(['D16', 'Q4']);
    expect(decodeMoves(game.moves).map(({ point }) => pointToHuman(point))).toEqual([
      'Q16',
      'passe',
      'D4',
    ]);
  });

  it.each([
    ['(;GM[2]SZ[19];B[pd])', /19 × 19/],
    ['(;SZ[9];B[cc])', /19 × 19/],
    ['(;SZ[19];B[pd]', /incomplet/],
    ['(;SZ[19];B[pd])(;SZ[19];B[qp])', /une seule partie/],
    ['(;SZ[19];B[pd];W[pd])', /coup illégal/],
    ['(;SZ[19]AW[dd];B[pd])', /position composée/],
    ['(;SZ[19]KM[absent];B[pd])', /komi/],
  ])('signale un fichier incompatible %s', (data, error) => {
    expect(() => importSgf(data, 'local-test', 'Partie.sgf')).toThrow(error);
  });
});
