import type { GameRecord } from './game.ts';

/** `coup` is the number of recorded moves already played, not the next move. */
export function resolvePositionLink(
  search: string,
  publicGames: readonly Pick<GameRecord, 'id' | 'moves' | 'imported'>[],
) {
  const params = new URLSearchParams(search);
  const ids = params.getAll('partie');
  const moves = params.getAll('coup');
  const [gameId] = ids;
  const [rawMove] = moves;
  if (
    ids.length !== 1 ||
    moves.length !== 1 ||
    !gameId ||
    !rawMove ||
    !/^(?:0|[1-9]\d{0,3})$/.test(rawMove)
  )
    return null;
  const gameIndex = publicGames.findIndex((game) => game.id === gameId && !game.imported);
  const game = publicGames[gameIndex];
  const move = Number(rawMove);
  return game && move <= game.moves.length / 3 ? { gameIndex, move } : null;
}
