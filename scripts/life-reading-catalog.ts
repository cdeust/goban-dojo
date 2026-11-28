import { LIFE_IN_ONE_CASES, LIFE_IN_TWO_CASES } from './life-reading-cases.ts';
import type { AdvancedTacticExercise } from '../src/domain/advancedTactics.ts';
import { certifiedEyes, lifeFinishes, lifeReadingProof } from '../src/domain/lifeReading.ts';
import { schoolPosition } from '../src/domain/school.ts';
import { decodeMoves, type GameRecord } from '../src/domain/game.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';

type Position = { gameId: string; before: number };
export function lifeReadingCatalog(
  games: readonly GameRecord[],
  teaching: readonly Position[],
  exams: readonly Position[],
): AdvancedTacticExercise[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const usedGames = new Set(teaching.map((e) => e.gameId));
  const examGames = new Set(exams.map((e) => e.gameId));
  const key = (e: Position) => {
    const g = byId.get(e.gameId)!;
    return canonicalPosition(schoolPosition(g, e.before), decodeMoves(g.moves)[e.before]!.color);
  };
  const occupied = new Set([...teaching, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
  return [
    ...LIFE_IN_ONE_CASES.map((c) => ({ c, module: 'make-life' as const })),
    ...LIFE_IN_TWO_CASES.map((c) => ({ c, module: 'life-in-two' as const })),
  ].map(({ c, module }) => {
    const [gameId, before, color, target, first] = c,
      g = byId.get(gameId);
    const id = `${module}:${gameId}:${before}`;
    if (
      !g ||
      g.imported ||
      g.rengo ||
      !g.sources.length ||
      !usedGames.has(gameId) ||
      examGames.has(gameId) ||
      decodeMoves(g.moves)[before]?.color !== color
    )
      throw new Error(`Invalid kifu prefix ${id}`);
    const identity = key({ gameId, before });
    if (occupied.has(identity)) throw new Error(`Duplicate course position ${id}`);
    const board = schoolPosition(g, before);
    if (board.get(target) !== color || certifiedEyes(board, target).length >= 2)
      throw new Error(`Invalid life target ${id}`);
    const base: AdvancedTacticExercise = {
      id,
      module,
      gameId,
      before,
      color,
      anchors: [target],
      candidate: first,
    };
    if (module === 'make-life') {
      if (!lifeFinishes(board, color, target).includes(first))
        throw new Error(`Unproved life in one ${id}`);
    } else {
      if (lifeFinishes(board, color, target).length)
        throw new Error(`Already solvable in one ${id}`);
      const proof = lifeReadingProof(board, color, target, first);
      if (!proof || proof.legalReplies < 1) throw new Error(`Unproved life in two ${id}`);
      base.line = [first, proof.reply, proof.finishes[0]!];
    }
    occupied.add(identity);
    return base;
  });
}
