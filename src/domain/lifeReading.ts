import { Board, PASS, POINTS, neighbours, opposite, type Color } from './board.ts';

/** A sufficient life certificate: two distinct one-intersection eyes of the same connected chain. */
export function certifiedEyes(board: Board, target: number): number[] {
  const chain = new Set(board.stonesOf(target));
  return adjacentEmpty(board, target).filter((p) => neighbours(p).every((q) => chain.has(q)));
}

function adjacentEmpty(board: Board, target: number): number[] {
  return [
    ...new Set(
      board
        .stonesOf(target)
        .flatMap(neighbours)
        .filter((p) => board.get(p) === null),
    ),
  ];
}

/** Every local legal move that immediately creates the sufficient life certificate. */
export function lifeFinishes(board: Board, color: Color, target: number): number[] {
  if (board.get(target) !== color) return [];
  return adjacentEmpty(board, target).filter((p) => {
    const next = board.clone();
    return (
      !next.play(color, p).illegal &&
      next.get(target) === color &&
      certifiedEyes(next, target).length >= 2
    );
  });
}

export interface LifeReadingProof {
  reply: number;
  finishes: readonly number[];
  legalReplies: number;
}
const distance = (a: number, b: number) =>
  Math.abs((a % 19) - (b % 19)) + Math.abs(Math.floor(a / 19) - Math.floor(b / 19));

/** Bounded two-turn life search. The defender can play any legal board move or pass.
 * Attacker moves are restricted to liberties of the target. A positive certificate is sufficient
 * for life under the board rules. Null means not proved by this restricted search.
 */
export function lifeReadingProof(
  board: Board,
  color: Color,
  target: number,
  first: number,
): LifeReadingProof | null {
  if (
    board.get(target) !== color ||
    certifiedEyes(board, target).length >= 2 ||
    !adjacentEmpty(board, target).includes(first)
  )
    return null;
  const after = board.clone();
  if (
    after.play(color, first).illegal ||
    after.get(target) !== color ||
    certifiedEyes(after, target).length >= 2 ||
    lifeFinishes(after, color, target).length === 0
  )
    return null;
  const chain = after.stonesOf(target);
  let hardest: { reply: number; finishes: number[]; distance: number; libs: number } | undefined;
  let legalReplies = 0;
  const opponent = opposite(color);
  // Local defences first, so refutations terminate early. Every legal reply is checked.
  const local = adjacentEmpty(after, target);
  const replies = [
    ...local,
    ...Array.from({ length: POINTS + 1 }, (_, p) => p - 1).filter((p) => !local.includes(p)),
  ];
  for (const reply of replies) {
    if (reply !== PASS && after.get(reply) !== null) continue;
    const defended = after.clone();
    if (defended.play(opponent, reply).illegal) continue;
    legalReplies++;
    if (defended.get(target) !== color) return null;
    const finishes = lifeFinishes(defended, color, target);
    if (!finishes.length) return null;
    const d = reply === PASS ? Infinity : Math.min(...chain.map((p) => distance(p, reply)));
    const libs = defended.libertyCount(target);
    if (
      !hardest ||
      finishes.length < hardest.finishes.length ||
      (finishes.length === hardest.finishes.length &&
        (libs < hardest.libs || (libs === hardest.libs && d < hardest.distance)))
    )
      hardest = { reply, finishes, distance: d, libs };
  }
  return hardest ? { reply: hardest.reply, finishes: hardest.finishes, legalReplies } : null;
}
