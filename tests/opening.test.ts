import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIZE } from '../src/domain/board.ts';
import { decodeMoves, type Dataset, type Move } from '../src/domain/game.ts';
import { shusakuOpening } from '../src/domain/opening.ts';

/** Coordonnée usuelle (« R16 ») → point ; la ligne 19 est en haut, la lettre I n'existe pas. */
const at = (name: string): number => {
  const x = 'ABCDEFGHJKLMNOPQRST'.indexOf(name.charAt(0));
  return (SIZE - Number(name.slice(1))) * SIZE + x;
};
const game = (...names: string[]): Move[] =>
  names.map((name, i) => ({ color: i % 2 === 0 ? 'B' : 'W', point: at(name) }));

/** Diagramme de Wikipedia, « Shusaku opening ». */
const REFERENCE = game('R16', 'D17', 'Q3', 'P17', 'C4', 'R5', 'Q15');

describe('ouverture de Shūsaku', () => {
  it('reconnaît le diagramme de référence, kosumi au coup 7', () => {
    expect(shusakuOpening(REFERENCE, 0)).toEqual({ fuseki: true, kosumi: 7 });
  });

  it('la reconnaît dans les huit orientations du goban', () => {
    const turn = (p: number): number => (p % SIZE) * SIZE + (SIZE - 1 - Math.floor(p / SIZE));
    const flip = (p: number): number => Math.floor(p / SIZE) * SIZE + (SIZE - 1 - (p % SIZE));
    let moves = REFERENCE;
    for (let i = 0; i < 4; i++) {
      moves = moves.map((m) => ({ ...m, point: turn(m.point) }));
      expect(shusakuOpening(moves, 0)).toEqual({ fuseki: true, kosumi: 7 });
      const mirrored = moves.map((m) => ({ ...m, point: flip(m.point) }));
      expect(shusakuOpening(mirrored, 0)).toEqual({ fuseki: true, kosumi: 7 });
    }
  });

  it('ne la voit pas sans les trois komoku, ni avec handicap', () => {
    expect(shusakuOpening(game('Q16', 'D17', 'Q3', 'P17', 'C4', 'R5', 'Q15'), 0).fuseki).toBe(
      false,
    );
    // Deux komoku dans le même coin n'en font pas trois coins.
    expect(shusakuOpening(game('R16', 'D17', 'Q17', 'P17', 'C4'), 0).fuseki).toBe(false);
    expect(shusakuOpening(REFERENCE, 2).fuseki).toBe(false);
  });

  it('sans approche blanche, la diagonale n’est pas le kosumi', () => {
    const moves = game('R16', 'D17', 'Q3', 'D4', 'C4', 'K10', 'Q15');
    expect(shusakuOpening(moves, 0)).toEqual({ fuseki: true });
  });

  it('les chiffres cités dans le récit sont ceux du corpus', () => {
    const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
    const found = games.filter((g) => shusakuOpening(decodeMoves(g.moves), g.handicap).fuseki);
    const his = found.filter((g) => g.shusaku === 'B');
    const count = (winner: string): number => his.filter((g) => g.result.winner === winner).length;
    expect(found.length).toBe(68);
    expect([found[0]?.id, found[0]?.date, found[0]?.shusaku]).toEqual(['s050', '1843-05-24', 'W']);
    expect([his[0]?.id, his[0]?.date]).toEqual(['s052', '1843-07-18']);
    expect(his.length).toBe(52);
    expect([count('B'), count('W'), count('jigo')]).toEqual([42, 6, 2]);
  });
});
