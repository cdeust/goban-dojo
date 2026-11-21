import { useEffect, useReducer, useState } from 'react';
import { analyzeZero } from '../engine/zeroClient.ts';
import { isLegalZeroMove } from '../engine/zeroSearch.ts';
import {
  exploreFinished,
  explorePosition,
  exploreReplyTo,
  useStore,
  type ExploreMove,
} from '../state/store.ts';

/** Une réponse ne peut être posée que sur la branche exacte qui l’a demandée. */
export async function playExploreReply(
  branch: ExploreMove[],
  signal: AbortSignal,
  search = analyzeZero,
): Promise<void> {
  const s = useStore.getState();
  const game = s.dataset?.games[s.gameIndex];
  if (!game || signal.aborted || exploreReplyTo(s) !== branch) return;
  const position = explorePosition(s, game);
  const result = await search(position, { signal });
  if (signal.aborted || exploreReplyTo(useStore.getState()) !== branch) return;
  const choice = result.choices[0];
  if (!choice || !isLegalZeroMove(position, choice.point))
    throw new Error('Leela Zero n’a fourni aucune réponse légale.');
  useStore.setState({
    variation: [...branch, { color: position.next, point: choice.point, playedBy: 'leela' }],
    notice: null,
  });
}

export function useExploreOpponent() {
  const branch = useStore(exploreReplyTo);
  const finished = useStore(exploreFinished);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const [failure, setFailure] = useState<{
    branch: ExploreMove[];
    attempt: number;
    message: string;
  }>();
  useEffect(() => {
    if (!branch) return;
    const controller = new AbortController();
    void playExploreReply(branch, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted && exploreReplyTo(useStore.getState()) === branch)
        setFailure({
          branch,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
    });
    return () => controller.abort();
  }, [branch, attempt]);
  const error = failure?.branch === branch && failure.attempt === attempt ? failure.message : null;
  return { waiting: branch !== null && error === null, error, retry, finished };
}
