import { useEffect, useMemo, useReducer, useSyncExternalStore } from 'react';
import type { Move } from '../domain/game.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import type { EnginePosition } from '../engine/features.ts';
import { scoreMoveKey, VariationScoreCache, type MoveScore } from '../state/variationScores.ts';

/** La racine mémorisée par le lecteur reste la même pendant le choix et la lecture des branches. */
export function useVariationScores(
  position: EnginePosition,
  moves: readonly Move[],
  step: number,
  starts: readonly number[],
  compareVisible = false,
) {
  const cache = useMemo(() => new VariationScoreCache(position, evaluate), [position]);
  useSyncExternalStore(cache.subscribe, cache.snapshot);
  const status = useEngine((s) => s.status);
  const engineError = useEngine((s) => s.error);
  const [attempt, retryRequest] = useReducer((n: number) => n + 1, 0);
  const visible = moves.slice(0, step).map(scoreMoveKey).join('');
  const next = moves[step];
  const nextPath = next ? visible + scoreMoveKey(next) : '';
  const startsKey = starts.map((point) => scoreMoveKey({ color: position.next, point })).join(',');
  const parent = visible.slice(0, -3);
  const current = moves[step - 1];
  const compare = compareVisible && step >= 2 && current !== undefined;
  const suggested = compare ? cache.suggested(parent) : undefined;
  const siblingPoints = compare
    ? new Set([current.point, ...(suggested ?? [])])
    : new Set<number>();
  const siblingKey = current
    ? Array.from(
        siblingPoints,
        (point) => parent + scoreMoveKey({ color: current.color, point }),
      ).join(',')
    : '';
  const requested = useMemo(
    () =>
      new Set([
        parent,
        visible,
        '',
        ...(siblingKey ? siblingKey.split(',') : []),
        nextPath,
        ...(startsKey ? startsKey.split(',') : []),
      ]),
    [parent, visible, siblingKey, nextPath, startsKey],
  );

  useEffect(() => {
    if (useEngine.getState().status === 'idle') loadEngine();
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const controller = new AbortController();
    void cache.fill(requested, controller.signal);
    return () => controller.abort();
  }, [attempt, cache, requested, status]);

  const scores = new Map<number, MoveScore>();
  for (const point of starts) {
    const score = cache.afterMove(scoreMoveKey({ color: position.next, point }));
    if (score) scores.set(point, score);
  }
  const siblings = new Map<number, MoveScore>();
  if (current) {
    for (const point of siblingPoints) {
      const score = cache.afterMove(parent + scoreMoveKey({ color: current.color, point }));
      if (score) siblings.set(point, score);
    }
  }
  const error =
    status === 'failed'
      ? engineError || 'Moteur de score indisponible'
      : Array.from(requested, (path) => cache.error(path)).find(Boolean);
  return {
    root: cache.at(''),
    visible: cache.afterMove(visible),
    starts: scores,
    siblings,
    siblingsPending: compare && (!suggested || siblings.size < siblingPoints.size),
    error,
    retry: () => {
      cache.clearErrors();
      if (useEngine.getState().status === 'failed') loadEngine();
      retryRequest();
    },
  };
}
