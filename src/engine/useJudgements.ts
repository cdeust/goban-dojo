import { useEffect, useState } from 'react';
import { PASS } from '../domain/board.ts';
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
}

/** Jugements déjà calculés, par position et par coup : revenir en arrière ne recalcule rien. */
const cache = new Map<string, Judgement>();
const keyOf = (game: GameRecord, moves: Move[], point: number): string =>
  `${game.id}|${moves.map((m) => `${m.color}${m.point}`).join(',')}|${point}`;

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
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || !game) return;
    let cancelled = false;
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
          if (i === 0 && actual && actual.point !== PASS) {
            next ??= actual.color;
            if (actual.color === next) targets.push(actual.point);
          }
          if (explored && !targets.includes(explored.point)) targets.push(explored.point);
          if (!next) continue;
          const missing = targets.filter((p) => !cache.has(keyOf(game, before, p)));
          if (missing.length === 0) continue;
          const position: EnginePosition = { setupBlack: setup, moves: before, next };
          const results = await judgeMoves(evaluate, position, missing);
          missing.forEach((p, k) => {
            const j = results[k];
            if (j) cache.set(keyOf(game, before, p), j);
          });
          if (cancelled) return;
          bump((n) => n + 1);
        }
        setError(undefined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, game, move, variation]);

  if (!game || !ready) return { explored: [] };
  const played = timelineOf(game).moves.slice(0, move);
  const actual = timelineOf(game).moves[move];
  return {
    explored: variation.map((m, i) =>
      cache.get(keyOf(game, [...played, ...variation.slice(0, i)], m.point)),
    ),
    ...(actual && actual.point !== PASS && cache.has(keyOf(game, played, actual.point))
      ? { actual: cache.get(keyOf(game, played, actual.point)) as Judgement }
      : {}),
    ...(error ? { error } : {}),
  };
}
