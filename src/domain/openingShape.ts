import { POINTS, SIZE, type Board, type Color } from './board.ts';

export interface ShapeFacts {
  stones: number;
  chains: number;
  atari: number;
  twoLiberties: number;
  occupiedCorners: number;
}

/** Mesures de forme observables. Ne prédit ni la vie, ni le territoire, ni la valeur d'une chaîne. */
export function shapeFacts(board: Board, color: Color): ShapeFacts {
  const visited = new Set<number>();
  const corners = new Set<number>();
  let stones = 0;
  let chains = 0;
  let atari = 0;
  let twoLiberties = 0;
  for (let p = 0; p < POINTS; p++) {
    if (board.get(p) !== color) continue;
    stones++;
    const x = p % SIZE;
    const y = Math.floor(p / SIZE);
    if (Math.min(x, SIZE - 1 - x) <= 5 && Math.min(y, SIZE - 1 - y) <= 5)
      corners.add(Number(x >= SIZE / 2) + 2 * Number(y >= SIZE / 2));
    if (visited.has(p)) continue;
    for (const q of board.stonesOf(p)) visited.add(q);
    chains++;
    const liberties = board.libertyCount(p);
    if (liberties === 1) atari++;
    if (liberties === 2) twoLiberties++;
  }
  return { stones, chains, atari, twoLiberties, occupiedCorners: corners.size };
}
