import { opposite, PASS, POINTS } from '../domain/board.ts';
import {
  TRAINING_KOMI,
  TRAINING_VISITS,
  validTrainingVisits,
  areaScore,
  needsAdjudication,
  nextPlayer,
  newTrainingGame,
  toggleDeadGroup,
  trainingPosition,
  tryTrainingMove,
  type TrainingGame,
} from '../domain/trainingGame.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { judgeMoves, type Judgement } from '../engine/judge.ts';
import { analyzeZero } from '../engine/zeroClient.ts';

const KEY = 'goban-dojo.training-game.v1';
export interface TrainingReview {
  number: number;
  judgement: Judgement;
}
export interface TrainingSession {
  game: TrainingGame;
  review: TrainingReview[];
}

export function decodeTrainingSession(raw: string): TrainingSession | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== 'object' ||
      !('game' in data) ||
      !data.game ||
      typeof data.game !== 'object'
    )
      return null;
    const g = data.game as Partial<TrainingGame>;
    if (
      (g.human !== 'B' && g.human !== 'W') ||
      typeof g.createdAt !== 'string' ||
      !Array.isArray(g.moves) ||
      g.moves.length > 2000 ||
      !Array.isArray(g.dead)
    )
      return null;
    const visits = g.visits === undefined ? TRAINING_VISITS : g.visits;
    if (!validTrainingVisits(visits)) return null;
    let game = newTrainingGame(g.human, g.createdAt, visits);
    for (const m of g.moves) {
      if (!m || m.color !== nextPlayer(game)) return null;
      const played = tryTrainingMove(game, m.point);
      if (played.error) return null;
      game = played.game;
    }
    for (const p of g.dead) {
      if (!Number.isInteger(p) || p < 0 || p >= POINTS) return null;
      if (!game.dead.includes(p)) game = toggleDeadGroup(game, p);
    }
    if (game.dead.length !== g.dead.length || game.dead.some((p) => !g.dead?.includes(p)))
      return null;
    if (
      g.result?.kind === 'resign' &&
      g.result.winner === opposite(game.human) &&
      !game.dead.length
    )
      game = { ...game, result: g.result };
    else if (g.result?.kind === 'score' && needsAdjudication(game)) {
      const score = areaScore(game);
      if (
        score.black !== g.result.black ||
        score.white !== g.result.white ||
        score.winner !== g.result.winner
      )
        return null;
      game = { ...game, result: { kind: 'score', ...score } };
    } else if (g.result !== null) return null;
    const review =
      'review' in data && Array.isArray(data.review) && game.result
        ? data.review.filter((entry): entry is TrainingReview => {
            const j = entry?.judgement;
            return (
              Number.isInteger(entry?.number) &&
              game.moves[entry.number - 1]?.color === game.human &&
              j &&
              Number.isFinite(j.loss) &&
              j.loss >= 0 &&
              ['bon', 'discutable', 'erreur'].includes(j.verdict) &&
              Number.isInteger(j.best) &&
              j.best >= PASS &&
              j.best < POINTS &&
              Number.isInteger(j.rank) &&
              Number.isFinite(j.blackLeadBefore) &&
              Number.isFinite(j.blackLeadAfter) &&
              Number.isFinite(j.blackWinrateAfter)
            );
          })
        : [];
    return { game, review: [...new Map(review.map((e) => [e.number, e])).values()] };
  } catch {
    return null;
  }
}
export function loadTrainingSession(): TrainingSession | null {
  try {
    return decodeTrainingSession(localStorage.getItem(KEY) ?? '');
  } catch {
    return null;
  }
}
export function saveTrainingSession(session: TrainingSession): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
const ARCHIVE_KEY = 'goban-dojo.training-history.v1';

/** Local archive preserving full kifu and accumulated model review across matches. */
export function loadTrainingHistory(): TrainingSession[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.flatMap((entry) => {
      const session = decodeTrainingSession(JSON.stringify(entry));
      return session?.game.result ? [session] : [];
    });
  } catch {
    return [];
  }
}
export function archiveTrainingSession(session: TrainingSession): boolean {
  if (!session.game.result) return false;
  try {
    const history = loadTrainingHistory().filter(
      (entry) => entry.game.createdAt !== session.game.createdAt,
    );
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify([session, ...history]));
    return true;
  } catch {
    return false;
  }
}
export async function opponentMove(game: TrainingGame, signal: AbortSignal): Promise<TrainingGame> {
  if (game.result || needsAdjudication(game) || nextPlayer(game) === game.human)
    throw new Error('Ce n’est pas le tour de Leela Zero.');
  const result = await analyzeZero(
    { setupBlack: [], moves: game.moves, next: nextPlayer(game), komi: TRAINING_KOMI },
    { visits: game.visits, signal },
  );
  for (const choice of result.choices) {
    const played = tryTrainingMove(game, choice.point);
    if (!played.error) return played.game;
  }
  throw new Error('Leela Zero n’a proposé aucun coup légal.');
}
export async function reviewTrainingMove(
  game: TrainingGame,
  number: number,
): Promise<TrainingReview> {
  if (!game.result || useEngine.getState().status !== 'ready')
    throw new Error('Moteur d’analyse indisponible.');
  const move = game.moves[number - 1];
  if (!move || move.color !== game.human) throw new Error('Coup utilisateur absent.');
  const prefix = game.moves.slice(0, number - 1);
  const { board, seen } = trainingPosition(prefix);
  const [judgement] = await judgeMoves(
    async (positions) => {
      const results = await evaluate(positions);
      return results.map((result, i) => {
        if (positions[i]?.moves.length !== prefix.length) return result;
        const policy = result.policy.slice();
        for (let p = 0; p < POINTS; p++) {
          if (!policy[p]) continue;
          const candidate = board.clone();
          if (candidate.play(move.color, p).illegal || seen.has(candidate.positionKey()))
            policy[p] = 0;
        }
        return { ...result, policy };
      });
    },
    {
      setupBlack: [],
      moves: game.moves.slice(0, number - 1),
      next: move.color,
      komi: TRAINING_KOMI,
    },
    [move.point],
  );
  if (!judgement) throw new Error('Évaluation absente.');
  return { number, judgement };
}
export { loadEngine };
