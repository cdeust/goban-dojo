import { describe, expect, it } from 'vitest';
import { Board, PASS, pointFromSgf, pointToHuman, pointToSgf } from '../src/domain/board.ts';
import { NEVER, buildTimeline, decodeMoves, prisonersAt, type Move } from '../src/domain/game.ts';

const P = pointFromSgf;
const moves = (s: string): Move[] => decodeMoves(s.replaceAll(' ', ''));

describe('coordonnées', () => {
  it('convertit dans les deux sens', () => {
    expect(P('aa')).toBe(0);
    expect(P('ss')).toBe(360);
    expect(P('')).toBe(PASS);
    expect(P('tt')).toBe(PASS);
    for (let p = 0; p < 361; p++) expect(P(pointToSgf(p))).toBe(p);
  });

  it('nomme les points à la manière des kifus (sans colonne I)', () => {
    expect(pointToHuman(P('aa'))).toBe('A19');
    expect(pointToHuman(P('jj'))).toBe('K10');
    expect(pointToHuman(P('ss'))).toBe('T1');
    // Le coup de l'oreille rouge, « ji » dans le SGF.
    expect(pointToHuman(P('ji'))).toBe('K11');
  });

  it('refuse les coordonnées hors du goban', () => {
    expect(() => P('a')).toThrow(RangeError);
    expect(() => P('az')).toThrow(RangeError);
    expect(() => P('A1')).toThrow(RangeError);
  });
});

describe('Board.play', () => {
  it('capture une pierre privée de sa dernière liberté', () => {
    const b = new Board();
    b.play('W', P('dd'));
    b.play('B', P('cd'));
    b.play('B', P('ed'));
    b.play('B', P('dc'));
    expect(b.play('B', P('de')).captures).toEqual([P('dd')]);
    expect(b.get(P('dd'))).toBeNull();
  });

  it('capture un groupe entier, dans le coin', () => {
    const b = new Board();
    for (const c of ['aa', 'ba']) b.play('W', P(c));
    b.play('B', P('ab'));
    b.play('B', P('bb'));
    const res = b.play('B', P('ca'));
    expect([...res.captures].sort((x, y) => x - y)).toEqual([P('aa'), P('ba')]);
  });

  it('autorise un coup sans liberté s’il capture', () => {
    const b = new Board();
    // Noir entoure a19 ; Blanc tient b19 avec une seule liberté restante en a19.
    b.play('W', P('ba'));
    b.play('B', P('ca'));
    b.play('B', P('bb'));
    const res = b.play('B', P('aa'));
    expect(res.illegal).toBeUndefined();
    expect(res.captures).toEqual([P('ba')]);
  });

  it('signale le suicide', () => {
    const b = new Board();
    b.play('B', P('ba'));
    b.play('B', P('ab'));
    expect(b.play('W', P('aa')).illegal).toBe('suicide');
    expect(b.get(P('aa'))).toBeNull();
  });

  it('signale un point occupé', () => {
    const b = new Board();
    b.play('B', P('dd'));
    expect(b.play('W', P('dd')).illegal).toBe('occupied');
  });

  it('signale la reprise immédiate d’un ko, puis l’autorise après un coup ailleurs', () => {
    const ko = (): Board => {
      const b = new Board();
      for (const c of ['cd', 'dc', 'de']) b.play('B', P(c));
      for (const c of ['fd', 'ec', 'ee']) b.play('W', P(c));
      b.play('B', P('ed'));
      expect(b.play('W', P('dd')).captures).toEqual([P('ed')]);
      return b;
    };
    expect(ko().play('B', P('ed')).illegal).toBe('ko');
    const b = ko();
    b.play('B', P('qq'));
    b.play('W', P('qp'));
    const retake = b.play('B', P('ed'));
    expect(retake.illegal).toBeUndefined();
    expect(retake.captures).toEqual([P('dd')]);
  });
});

describe('buildTimeline', () => {
  it('suit la vie de chaque pierre', () => {
    const t = buildTimeline([], moves('wdd bcd wqq bed wqp bdc wpq bde'));
    expect(t.illegal).toEqual([]);
    expect(t.stones).toHaveLength(8);
    expect(t.stones[0]).toMatchObject({ color: 'W', placedAt: 1, capturedAt: 8, slot: 0 });
    expect(t.stones[1]).toMatchObject({ color: 'B', placedAt: 2, capturedAt: NEVER, slot: 0 });
    expect(t.capturesAt[8]).toEqual([0]);
    expect(t.stoneOfMove[8]).toBe(7);
    expect(t.counts).toEqual({ B: 4, W: 4 });
    expect(prisonersAt(t, 7)).toEqual({ B: 0, W: 0 });
    expect(prisonersAt(t, 8)).toEqual({ B: 1, W: 0 });
  });

  it('place les pierres de handicap avant le premier coup', () => {
    const t = buildTimeline([P('dd'), P('pp')], moves('wqd b--'));
    expect(t.stones.slice(0, 2).map((s) => s.placedAt)).toEqual([0, 0]);
    expect(t.stoneOfMove[1]).toBe(2);
    expect(t.stoneOfMove[2]).toBe(-1);
  });
});
