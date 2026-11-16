import { describe, expect, it } from 'vitest';
import { Board, PASS, pointFromSgf, pointToHuman, pointToSgf } from '../src/domain/board.ts';
import {
  NEVER,
  buildTimeline,
  decodeMoves,
  prisonersAt,
  threatOf,
  type Move,
} from '../src/domain/game.ts';

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

describe('threatOf', () => {
  it('signale les pierres mises en atari par le coup', () => {
    // Blanc d16 entouré de trois côtés : le troisième coup noir le met en atari.
    const seq = moves('wdd bcd wqq bed wqp bdc');
    expect(threatOf([], seq, 2)).toEqual({ atari: [], captured: 0, connects: [] });
    expect(threatOf([], seq, 4)).toEqual({ atari: [], captured: 0, connects: [] });
    expect(threatOf([], seq, 6)).toEqual({ atari: [P('dd')], captured: 0, connects: [] });
  });

  it('compte les captures et ne signale pas en atari un groupe déjà capturé', () => {
    const seq = moves('wdd bcd wqq bed wqp bdc wpq bde');
    expect(threatOf([], seq, 8)).toEqual({ atari: [], captured: 1, connects: [] });
  });

  it('met en atari un groupe entier', () => {
    // Deux pierres blanches c17-d17 ; Noir ferme b17, c16, d16, c18, d18 : reste e17.
    const seq = moves('wcc bbc wdc bcd wqq bdd wqp bcb wpq bdb');
    expect(threatOf([], seq, 10)).toEqual({ atari: [P('cc'), P('dc')], captured: 0, connects: [] });
  });

  it('ne dit rien d’une passe ni d’un coup hors de la partie', () => {
    expect(threatOf([], moves('bdd w--'), 2)).toEqual({ atari: [], captured: 0, connects: [] });
    expect(threatOf([], moves('bdd'), 5)).toEqual({ atari: [], captured: 0, connects: [] });
  });

  it('reconnaît un coup qui relie deux groupes', () => {
    // Noir d16 et f16 sont deux groupes ; e16 les relie. g16 prolonge ensuite un seul groupe.
    const seq = moves('bdd wqq bfd wqp bed wpq bgd');
    expect(threatOf([], seq, 5).connects).toEqual([P('dd'), P('fd')]);
    expect(threatOf([], seq, 7).connects).toEqual([]);
  });

  it('ne compte pas comme connexion deux voisines déjà du même groupe', () => {
    // d16, d17, e17 forment un seul groupe ; e16 touche d16 et e17, sans rien relier de nouveau.
    const seq = moves('bdd wqq bdc wqp bec wpq bed');
    expect(threatOf([], seq, 7).connects).toEqual([]);
  });
});
