import { useEffect, useRef, useState } from 'react';
import { pointToHuman } from '../domain/board.ts';
import type { EnginePosition } from '../engine/features.ts';
import { analyzeZero } from '../engine/zeroClient.ts';
import {
  moreReadingAlternatives,
  type ReadingCandidate,
  type ReadingAlternativesState,
} from '../state/readingAlternatives.ts';
import { blackWinLabel } from '../state/zeroReading.ts';

interface Props {
  positionKey: string;
  cache: Map<string, ReadingAlternativesState>;
  position: () => EnginePosition;
  visits: number;
  known: number[];
  chosen?: number;
  onChoose: (choice: ReadingCandidate, conditional: boolean) => void;
  onSearch: () => void;
}

export function ReadingAlternatives({
  positionKey,
  cache,
  position,
  visits,
  known,
  chosen,
  onChoose,
  onSearch,
}: Props) {
  const [result, setResult] = useState<ReadingAlternativesState>(
    () => cache.get(positionKey) ?? { batches: [], exhausted: false },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function cancel() {
    controller.current?.abort();
    setLoading(false);
  }
  async function search() {
    if (loading || result.exhausted) return;
    onSearch();
    const request = new AbortController();
    controller.current = request;
    setError('');
    setLoading(true);
    try {
      const next = await moreReadingAlternatives(
        analyzeZero,
        position(),
        visits,
        request.signal,
        chosen === undefined ? known : [...known, chosen],
        result,
      );
      if (!request.signal.aborted) {
        cache.set(positionKey, next);
        setResult(next);
      }
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="reading__fork">
      {result.batches.map(({ excluded, choices }) => {
        const extra = choices.filter((choice) => !known.includes(choice.point));
        if (!extra.length) return null;
        return (
          <div key={excluded}>
            <p className="reflection__source">
              {excluded
                ? `Recherche supplémentaire · ${excluded} ${excluded === 1 ? 'coup déjà examiné écarté' : 'coups déjà examinés écartés'}`
                : 'Coups proposés par Leela Zero'}
            </p>
            <ol className="analysis__choices">
              {extra.map((choice) => (
                <li key={choice.point}>
                  <button
                    type="button"
                    className="analysis__choice"
                    aria-pressed={choice.point === chosen}
                    onClick={() => {
                      cancel();
                      onChoose(choice, excluded > 0);
                    }}
                  >
                    <strong>{pointToHuman(choice.point)}</strong>
                    <span>{blackWinLabel(choice.blackWin)}</span>
                    <small>
                      {choice.visits} {choice.visits === 1 ? 'visite' : 'visites'}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {loading ? (
        <button type="button" className="chip" onClick={cancel}>
          Arrêter la recherche d’alternatives
        </button>
      ) : (
        !result.exhausted && (
          <button type="button" className="chip" onClick={() => void search()}>
            Chercher d’autres coups
          </button>
        )
      )}
      {(error || result.exhausted || loading) && (
        <p role="status" className="analysis__coverage">
          {error ||
            (result.exhausted
              ? 'Tous les coups légaux de cette position ont été examinés.'
              : loading
                ? 'Recherche de coups supplémentaires…'
                : null)}
        </p>
      )}
    </div>
  );
}
