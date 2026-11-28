import { POINTS, SIZE, type Board, type Color } from './board.ts';

const maps = Array.from({ length: 8 }, (_, symmetry) =>
  Array.from({ length: POINTS }, (_, index) => {
    let x = index % SIZE;
    let y = Math.floor(index / SIZE);
    if (symmetry >= 4) x = SIZE - 1 - x;
    for (let i = 0; i < symmetry % 4; i++) [x, y] = [SIZE - 1 - y, x];
    return y * SIZE + x;
  }),
);

/** Identité pédagogique : même occupation et même camp au trait sous les huit symétries.
 * Ignore volontairement l'historique et le ko : une forme familière ne devient pas inédite
 * parce que l'ordre des coups ou les droits de répétition diffèrent.
 */
export function canonicalPosition(board: Board, next: Color): string {
  const cells = Array.from({ length: POINTS }, (_, p) => board.get(p) ?? '.');
  const keys = maps.map((map) => map.map((p) => cells[p]).join(''));
  return next + keys.reduce((min, key) => (key < min ? key : min), keys[0]!);
}
