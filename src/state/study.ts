import {
  decodeMoves,
  decodePoints,
  studyMoves,
  type GameRecord,
  type StudyMove,
} from '../domain/game.ts';

const cache = new WeakMap<GameRecord, StudyMove[]>();

export function studyOf(game: GameRecord): StudyMove[] {
  let index = cache.get(game);
  if (!index) {
    index = studyMoves(decodePoints(game.setupBlack), decodeMoves(game.moves));
    cache.set(game, index);
  }
  return index;
}
