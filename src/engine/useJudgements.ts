import { useEffect, useReducer, useState } from 'react';
import type { Color } from '../domain/board.ts';
import { decodePoints, type GameRecord, type Move } from '../domain/game.ts';
import { timelineOf } from '../state/store.ts';
import { evaluate, useEngine } from './client.ts';
import type { EnginePosition } from './features.ts';
import { judgeMoves, type Judgement } from './judge.ts';

export interface Judgements {
  /** Jugement de chaque coup exploré, dans l'ordre ; `undefined` tant qu'il est en calcul. */
  explored: (Judgement | undefined)[];
  /** Jugement du coup réellement joué dans la partie à partir de cette position. */
  actual?: Judgement;
  error?: string;
  retry: () => void;
}

/** Jugements déjà calculés, par position et par coup : revenir en arrière ne recalcule rien. */
interface GameCache {
  scores: Map<string, Judgement>;
  pending: Map<string, Promise<void>>;
}

const games = new WeakMap<GameRecord, GameCache>();
function cacheFor(game: GameRecord): GameCache {
  let cache = games.get(game);
  if (!cache) {
    cache = { scores: new Map(), pending: new Map() };
    games.set(game, cache);
  }
  return cache;
}

const keyOf = (moves: Move[], color: Color, point: number) =>
  moves.map((m) => m.color + m.point).join(',') + '|' + color + point;

/**
 * Juge le coup de la partie et les coups explorés à partir de la position `move`.
 * Ne fait rien tant que le moteur n'est pas chargé.
 */
export function useJudgements(
  game: GameRecord | null,
  move: number,
  variation: Move[],
): Judgements {
  const ready = useEngine((s) => s.status === 'ready');
  const [, bump] = useState(0);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const [failure, setFailure] = useState<{
    game: GameRecord;
    move: number;
    variation: Move[];
    attempt: number;
    message: string;
  }>();

  useEffect(() => {
    if (!ready || !game) return;
    let cancelled = false;
    const cache = cacheFor(game);
    const setup = decodePoints(game.setupBlack);
    const played = timelineOf(game).moves.slice(0, move);
    const actual = timelineOf(game).moves[move];

    void (async () => {
      try {
        // Position de départ : le coup de la partie, et le premier coup exploré s'il est de la même couleur.
        for (let i = 0; i <= variation.length; i++) {
          const before = [...played, ...variation.slice(0, i)];
          const explored = variation[i];
          const targets: number[] = [];
          let next = explored?.color;
          if (i === 0 && actual) {
            next ??= actual.color;
            if (actual.color === next) targets.push(actual.point);
          }
          if (explored && !targets.includes(explored.point)) targets.push(explored.point);
          if (!next) continue;
          const keys = targets.map((p) => keyOf(before, next, p));
          const missing = targets.filter((_, k) => !cache.scores.has(keys[k]!));
          if (missing.length === 0) continue;
          const position: EnginePosition = {
            setupBlack: setup,
            komi: game.komi,
            moves: before,
            next,
          };
          const batch = missing.map((p) => keyOf(before, position.next, p)).join(';');
          let work = cache.pending.get(batch);
          if (!work) {
            work = judgeMoves(evaluate, position, missing)
              .then((results) => {
                missing.forEach((p, k) => {
                  if (results[k]) cache.scores.set(keyOf(before, position.next, p), results[k]);
                });
              })
              .finally(() => cache.pending.delete(batch));
            cache.pending.set(batch, work);
          }
          await work;
          if (cancelled) return;
          bump((n) => n + 1);
        }
        if (!cancelled) setFailure(undefined);
      } catch (e) {
        if (!cancelled)
          setFailure({
            game,
            move,
            variation,
            attempt,
            message: e instanceof Error ? e.message : String(e),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, game, move, variation, attempt]);

  if (!game || !ready) return { explored: [], retry };
  const cache = games.get(game)?.scores;
  const played = timelineOf(game).moves.slice(0, move);
  const actual = timelineOf(game).moves[move];
  return {
    explored: variation.map((m, i) =>
      cache?.get(keyOf([...played, ...variation.slice(0, i)], m.color, m.point)),
    ),
    actual: actual && cache?.get(keyOf(played, actual.color, actual.point)),
    error:
      failure?.game === game &&
      failure.move === move &&
      failure.variation === variation &&
      failure.attempt === attempt
        ? failure.message
        : undefined,
    retry,
  };
}
