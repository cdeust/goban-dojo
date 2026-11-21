import { useEffect, useMemo, useReducer, useState } from 'react';
import type { GameRecord } from '../domain/game.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { StudyLines, studyStart } from '../state/studyLines.ts';

export function useStudyLines(
  game: GameRecord,
  base: number,
  enabled: boolean,
  selected: number | null,
) {
  const study = useMemo(() => {
    const { position, recorded } = studyStart(game, base);
    return new StudyLines(position, recorded, evaluate);
  }, [game, base]);
  const status = useEngine((s) => s.status);
  const engineError = useEngine((s) => s.error);
  const [attempt, retryRequest] = useReducer((n: number) => n + 1, 0);
  const [, update] = useReducer((n: number) => n + 1, 0);
  const [failure, setFailure] = useState<{
    study: StudyLines;
    point: number | null;
    attempt: number;
    message: string;
  }>();

  useEffect(() => {
    if (enabled && !study.finished && useEngine.getState().status === 'idle') loadEngine();
  }, [enabled, study]);

  useEffect(() => {
    if (!enabled || study.finished || status !== 'ready') return;
    const controller = new AbortController();
    void study.rank(controller.signal, update).catch((error: unknown) => {
      if (!controller.signal.aborted)
        setFailure({
          study,
          point: null,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
    });
    return () => controller.abort();
  }, [enabled, study, status, attempt]);

  useEffect(() => {
    if (!enabled || study.finished || status !== 'ready' || selected === null) return;
    const controller = new AbortController();
    void study.read(selected, controller.signal, update).catch((error: unknown) => {
      if (!controller.signal.aborted)
        setFailure({
          study,
          point: selected,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
    });
    return () => controller.abort();
  }, [enabled, study, status, selected, attempt]);

  const error =
    !enabled || study.finished
      ? null
      : status === 'failed'
        ? engineError || 'Moteur de score indisponible.'
        : failure?.study === study &&
            failure.attempt === attempt &&
            (failure.point === null || failure.point === selected)
          ? failure.message
          : null;
  return {
    rows: enabled ? study.rows() : [],
    moves: enabled && selected !== null ? study.line(selected) : [],
    ranking: enabled && !study.ranked && !study.finished && !error,
    reading: enabled && selected !== null && !study.complete(selected) && !error,
    finished: study.finished,
    next: study.position.next,
    error,
    retry: () => {
      study.clearErrors();
      if (useEngine.getState().status === 'failed') loadEngine();
      retryRequest();
    },
  };
}
