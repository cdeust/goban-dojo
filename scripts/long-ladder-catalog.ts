import { LONG_LADDER_CASES } from './long-ladder-cases.ts';
import { ladderProof, type AdvancedTacticExercise } from '../src/domain/advancedTactics.ts';
import { chainLiberties, schoolPosition } from '../src/domain/school.ts';
import { decodeMoves, type GameRecord } from '../src/domain/game.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';

type Position = { gameId: string; before: number };
export function longLadderCatalog(
  games: readonly GameRecord[],
  teaching: readonly Position[],
  exams: readonly Position[],
): AdvancedTacticExercise[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const usedGames = new Set(teaching.map((e) => e.gameId));
  const examGames = new Set(exams.map((e) => e.gameId));
  const key = (e: Position) => {
    const game = byId.get(e.gameId)!;
    return canonicalPosition(
      schoolPosition(game, e.before),
      decodeMoves(game.moves)[e.before]!.color,
    );
  };
  const occupied = new Set([...teaching, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
  const seenGames = new Set<string>();
  return LONG_LADDER_CASES.map(([gameId, before, color, target, first, horizon]) => {
    const game = byId.get(gameId);
    const id = `long-ladder:${gameId}:${before}`;
    if (
      !game ||
      game.imported ||
      game.rengo ||
      !game.sources.length ||
      !usedGames.has(gameId) ||
      examGames.has(gameId) ||
      seenGames.has(gameId) ||
      decodeMoves(game.moves)[before]?.color !== color
    )
      throw new Error(`Invalid historical case ${id}`);
    const identity = key({ gameId, before });
    if (occupied.has(identity)) throw new Error(`Duplicate course position ${id}`);
    const board = schoolPosition(game, before);
    const line = ladderProof(board, color, target, first, horizon);
    if (!line || line.length !== horizon || ladderProof(board, color, target, first, horizon - 2))
      throw new Error(`Invalid depth ${id}`);
    if (
      chainLiberties(board, target).some(
        (p) => p !== first && ladderProof(board, color, target, p, horizon),
      )
    )
      throw new Error(`Ambiguous first atari ${id}`);
    occupied.add(identity);
    seenGames.add(gameId);
    return {
      id,
      module: 'long-ladder',
      gameId,
      before,
      color,
      anchors: [target],
      candidate: first,
      line,
      horizon,
    };
  });
}
