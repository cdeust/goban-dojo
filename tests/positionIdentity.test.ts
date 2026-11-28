import { Board, pointFromHuman, SIZE } from '../src/domain/board.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { expect, it } from 'vitest';
const p = (s: string) => pointFromHuman(s)!;
it('reconnaît les 8 symétries et les transpositions sans confondre couleurs ou joueur au trait', () => {
  const stones = [
    { p: p('D4'), color: 'B' },
    { p: p('Q3'), color: 'W' },
    { p: p('D16'), color: 'B' },
  ] as const;
  const source = new Board();
  for (const s of stones) source.setup(s.p, s.color);
  const signature = canonicalPosition(source, 'W');
  for (let sym = 0; sym < 8; sym++) {
    const b = new Board();
    for (const s of stones) {
      let x = s.p % SIZE,
        y = Math.floor(s.p / SIZE);
      if (sym >= 4) x = SIZE - 1 - x;
      for (let r = 0; r < sym % 4; r++) [x, y] = [SIZE - 1 - y, x];
      b.setup(y * SIZE + x, s.color);
    }
    expect(canonicalPosition(b, 'W')).toBe(signature);
    expect(canonicalPosition(b, 'B')).not.toBe(signature);
  }
  const change = source.clone();
  change.setup(p('D4'), 'W');
  expect(canonicalPosition(change, 'W')).not.toBe(signature);
});
