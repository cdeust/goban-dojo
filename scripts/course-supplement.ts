/** Extend the published bank without replacing any existing exercise or exam. */
import { Board, neighbours, PASS } from '../src/domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord } from '../src/domain/game.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import {
  emptyRegion,
  schoolPosition,
  schoolWindow,
  type SchoolExercise,
} from '../src/domain/school.ts';
import {
  BRIDGE_MODULES,
  extractStrategyCourse,
  type StrategyLesson,
} from '../src/story/strategyCourse.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';

export const EXTRA_SHARED = 12;
export const EXTRA_MIXED = 12;
export const EXTRA_BRIDGE_PER_MODULE = 4;
type Position = { gameId: string; before: number };

export function courseSupplement(
  games: readonly GameRecord[],
  training: readonly Position[],
  exams: readonly Position[],
) {
  const byId = new Map(games.map((game) => [game.id, game]));
  const key = (p: Position) => {
    const game = byId.get(p.gameId)!;
    return canonicalPosition(
      schoolPosition(game, p.before),
      decodeMoves(game.moves)[p.before]!.color,
    );
  };
  const occupied = new Set([...training, ...LESSONS, ...OPENING_CASE_POSITIONS, ...exams].map(key));
  const examGames = new Set(exams.map((e) => e.gameId));
  const teachingGames = new Set(training.map((e) => e.gameId));
  const pool = games.filter(
    (g) =>
      teachingGames.has(g.id) &&
      !examGames.has(g.id) &&
      !g.imported &&
      !g.rengo &&
      g.sources.length,
  );
  const school: SchoolExercise[] = [];
  const sharedGames = new Set<string>();
  const mixedGames = new Set<string>();
  // Preserve all old IDs. Enrich the bank with positions that discriminate the misconception.
  for (const game of pool) {
    const board = new Board();
    for (const p of decodePoints(game.setupBlack)) board.setup(p, 'B');
    const moves = decodeMoves(game.moves);
    for (let before = 0; before < moves.length; before++) {
      const move = moves[before]!;
      const trial = board.clone();
      if (trial.play(move.color, move.point).illegal) break;
      if (move.point !== PASS) {
        const add = (module: SchoolExercise['module'], anchors: number[], candidate?: number) => {
          const k = canonicalPosition(board, move.color);
          if (occupied.has(k)) return false;
          const ex: SchoolExercise = {
            id: `${module}:${game.id}:${before}`,
            module,
            gameId: game.id,
            before,
            color: move.color,
            anchors,
            ...(candidate === undefined ? {} : { candidate }),
          };
          if (schoolWindow(board, ex).size > 11) return false;
          school.push(ex);
          occupied.add(k);
          return true;
        };
        if (sharedGames.size < EXTRA_SHARED && !sharedGames.has(game.id) && before >= 8) {
          const seen = new Set<number>();
          for (const anchor of neighbours(move.point)) {
            if (!board.get(anchor) || seen.has(anchor)) continue;
            const chain = board.stonesOf(anchor);
            chain.forEach((p) => seen.add(p));
            const adjacent = chain.flatMap(neighbours).filter((p) => board.get(p) === null);
            const distinct = new Set(adjacent).size;
            // Both the correct number and the mistaken double-count fit the response buttons.
            if (
              distinct >= 2 &&
              distinct < adjacent.length &&
              adjacent.length <= 6 &&
              add('liberties', [anchor])
            ) {
              sharedGames.add(game.id);
              break;
            }
          }
        }
        if (mixedGames.size < EXTRA_MIXED && !mixedGames.has(game.id) && before >= 100) {
          const region = emptyRegion(board, move.point);
          if (
            region.border.size === 2 &&
            region.points.length >= 2 &&
            region.points.length <= 6 &&
            add('region-size', region.points, move.point)
          )
            mixedGames.add(game.id);
        }
      }
      board.play(move.color, move.point);
    }
    if (sharedGames.size === EXTRA_SHARED && mixedGames.size === EXTRA_MIXED) break;
  }
  const strategy: StrategyLesson[] = [];
  const candidates = extractStrategyCourse(pool, 30);
  for (const module of BRIDGE_MODULES) {
    const prior = new Set<string>();
    // Avoid source repetition in the new exercises for each skill.
    for (const ex of candidates.filter((l) => l.module === module.id)) {
      const k = key(ex);
      if (occupied.has(k) || prior.has(ex.gameId)) continue;
      strategy.push(ex);
      occupied.add(k);
      prior.add(ex.gameId);
      if (prior.size === EXTRA_BRIDGE_PER_MODULE) break;
    }
    if (prior.size !== EXTRA_BRIDGE_PER_MODULE)
      throw new Error(`Insufficient new cases for ${module.id}`);
  }
  if (sharedGames.size !== EXTRA_SHARED || mixedGames.size !== EXTRA_MIXED)
    throw new Error('Insufficient shared-liberty or mixed-boundary cases');
  return { school, strategy };
}

/** Put transfer questions early enough to be seen during the guided mastery threshold.
 * Every old item keeps its ID and relative order; only additional items are inserted.
 */
export function interleaveSupplement<T extends { module: string }>(
  original: readonly T[],
  supplement: readonly T[],
  spacing: number,
): T[] {
  const counts = new Map<string, number>();
  const pending = new Map<string, T[]>();
  for (const item of supplement) {
    const bucket = pending.get(item.module) ?? [];
    bucket.push(item);
    pending.set(item.module, bucket);
  }
  const merged = original.flatMap((item) => {
    const index = counts.get(item.module) ?? 0;
    counts.set(item.module, index + 1);
    const next = index % spacing === 0 ? pending.get(item.module)?.shift() : undefined;
    return next ? [item, next] : [item];
  });
  if ([...pending.values()].some((items) => items.length))
    throw new Error('Unscheduled transfer exercise');
  return merged;
}
