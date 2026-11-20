import { describe, expect, it } from 'vitest';
import { Board, PASS, POINTS } from '../src/domain/board.ts';

describe('coordonnées transmises au goban', () => {
  it.each(['5', 'intersection', true, null, {}, -2, POINTS, 1.5, Infinity, NaN])(
    'rejette %j sans modifier la position',
    (input) => {
      const board = new Board();
      board.setup(5, 'W');
      const key = board.positionKey();
      const point = input as number;
      expect(() => board.setup(point, 'B')).toThrow(RangeError);
      expect(() => board.play('B', point)).toThrow(RangeError);
      expect(() => board.stonesOf(point)).toThrow(RangeError);
      expect(() => board.libertyCount(point)).toThrow(RangeError);
      expect(() => board.get(point)).toThrow(RangeError);
      expect(board.positionKey()).toBe(key);
    },
  );

  it('accepte les points des deux extrémités et réserve la passe aux coups', () => {
    const board = new Board();
    board.setup(0, 'B');
    expect(board.play('W', POINTS - 1)).toEqual({ captures: [] });
    expect(board.play('B', PASS)).toEqual({ captures: [] });
    expect(board.get(PASS)).toBeNull();
    expect(() => board.setup(PASS, 'B')).toThrow(RangeError);
    expect(board.get(0)).toBe('B');
    expect(board.get(POINTS - 1)).toBe('W');
  });
});
