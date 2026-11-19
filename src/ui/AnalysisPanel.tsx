import { useEffect, useRef, useState } from 'react';
import { PASS, pointToHuman } from '../domain/board.ts';
import { decodePoints, type GameRecord, type Move } from '../domain/game.ts';
import {
  afterCandidate,
  ANALYSIS_WIDTH,
  candidatesOf,
  type Candidate,
} from '../engine/analysis.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import type { Evaluation } from '../engine/decode.ts';
import type { EnginePosition } from '../engine/features.ts';
import { nextColor, timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName } from '../story/format.ts';
import { reflectionsOf } from '../state/reflections.ts';

interface Branch {
  lead: number;
  replies: Candidate[];
}

interface Scan {
  key: string;
  candidates: Candidate[];
  branches: Map<number, Branch>;
  error?: string;
}

const policyPercent = new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 1 });

function leadLabel(lead: number): string {
  const rounded = Math.round(Math.abs(lead));
  return rounded === 0 ? 'Équilibre' : `${lead > 0 ? 'Noir' : 'Blanc'} +${rounded} pts`;
}

function AnalysisTree({ game, base, path }: { game: GameRecord; base: number; path: Move[] }) {
  const click = useStore((s) => s.clickPoint);
  const trim = useStore((s) => s.trimAnalysis);
  const mark = useStore((s) => s.markAnalysis);
  const notice = useStore((s) => s.notice);
  const next = useStore(nextColor);
  const heading = useRef<HTMLHeadingElement>(null);
  const cache = useRef(new Map<string, Promise<Evaluation>>());
  const [scan, setScan] = useState<Scan>();
  const [retry, setRetry] = useState(0);
  const key = path.map(({ color, point }) => `${color}${point}`).join(',');
  const data = scan?.key === key ? scan : undefined;

  useEffect(() => {
    let cancelled = false;
    const history = timelineOf(game).moves;
    const position: EnginePosition = {
      setupBlack: decodePoints(game.setupBlack),
      komi: game.komi,
      moves: [...history.slice(0, base), ...path],
      next,
    };
    const onKifu = path.every(({ point, color }, i) => {
      const move = history[base + i];
      return move?.point === point && move.color === color;
    });

    function read(p: EnginePosition): Promise<Evaluation> {
      const id = `${p.next}:${p.moves
        .slice(base)
        .map((m) => `${m.color}${m.point}`)
        .join(',')}`;
      const cached = cache.current.get(id);
      if (cached) return cached;
      const pending = evaluate([p])
        .then(([result]) => {
          if (!result) throw new Error('Évaluation absente');
          return result;
        })
        .catch((error: unknown) => {
          cache.current.delete(id);
          throw error;
        });
      cache.current.set(id, pending);
      return pending;
    }

    void (async () => {
      let candidates: Candidate[] = [];
      const branches = new Map<number, Branch>();
      try {
        const root = await read(position);
        if (cancelled) return;
        const recorded = history[base + path.length];
        candidates = candidatesOf(
          position,
          root.policy,
          onKifu && recorded?.color === next ? recorded.point : undefined,
        );
        mark(candidates.filter(({ point }) => point !== PASS));
        setScan({ key, candidates, branches: new Map() });
        for (const candidate of candidates) {
          const child = afterCandidate(position, candidate.point);
          const result = await read(child);
          if (cancelled) return;
          const reply = history[base + path.length + 1];
          const historicalReply =
            candidate.recorded && reply?.color === child.next ? reply.point : undefined;
          branches.set(candidate.point, {
            lead: result.blackLead,
            replies: candidatesOf(child, result.policy, historicalReply),
          });
          setScan({ key, candidates, branches: new Map(branches) });
        }
      } catch (error) {
        if (!cancelled) {
          setScan({
            key,
            candidates,
            branches,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [game, base, path, next, key, mark, retry]);

  const examined = data?.branches.size ?? 0;
  const finished = data && examined === data.candidates.length;
  const replies = [...(data?.branches.values() ?? [])].reduce(
    (n, branch) => n + branch.replies.length,
    0,
  );
  const recorded = data?.candidates.find((candidate) => candidate.recorded);
  const reference = recorded === undefined ? undefined : data?.branches.get(recorded.point);
  const percent = (prior: number) => (prior < 0.001 ? '< 0,1 %' : policyPercent.format(prior));

  return (
    <div className="analysis__tree">
      <h3 tabIndex={-1} ref={heading}>
        {colorName(next)} au trait
      </h3>
      <p className="analysis__turn">
        Coup {base + path.length + 1} · cliquez sur le goban ou choisissez un repère.
      </p>
      {path.length > 0 && (
        <nav className="analysis__path" aria-label="Branche jouée">
          <button
            type="button"
            className="chip"
            onClick={() => {
              trim(0);
              heading.current?.focus();
            }}
          >
            Départ
          </button>
          {path.map(({ color, point }, i) => (
            <button
              key={i}
              type="button"
              className="chip"
              aria-current={i === path.length - 1 ? 'step' : undefined}
              aria-label={`Revenir après ${colorName(color)} ${pointToHuman(point)}, coup ${base + i + 1}`}
              onClick={() => {
                trim(i + 1);
                heading.current?.focus();
              }}
            >
              {base + i + 1} · {pointToHuman(point)}
            </button>
          ))}
        </nav>
      )}
      {(!data || (!finished && !data.error)) && (
        <label className="analysis__progress">
          {data
            ? `Coups examinés · ${examined} / ${data.candidates.length}`
            : 'Lecture de la position…'}
          <progress
            value={data ? examined : undefined}
            max={data?.candidates.length || ANALYSIS_WIDTH}
          />
        </label>
      )}
      <p role="status" className="analysis__coverage">
        {finished &&
          (data.candidates.length > 0
            ? `${data.candidates.length} coups examinés · ${replies} suites en deux coups`
            : 'La branche est terminée après deux passes.')}
      </p>
      {data?.error && (
        <p role="status">
          Analyse interrompue ({data.error}).{' '}
          <button
            type="button"
            className="chip"
            onClick={() => {
              setScan(undefined);
              setRetry(retry + 1);
            }}
          >
            Réessayer
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <ol className="analysis__choices">
        {data?.candidates.map((candidate) => {
          const result = data.branches.get(candidate.point);
          const delta =
            result && reference
              ? Math.round((result.lead - reference.lead) * (next === 'B' ? 1 : -1))
              : undefined;
          return (
            <li key={candidate.point}>
              <button
                type="button"
                className="analysis__choice"
                data-recorded={candidate.recorded}
                onClick={() => {
                  click(candidate.point);
                  heading.current?.focus({ preventScroll: true });
                }}
              >
                <span className="analysis__rank">{candidate.rank}</span>
                <span>
                  <strong>{pointToHuman(candidate.point)}</strong>{' '}
                  {candidate.recorded && <small>Coup du kifu</small>}
                </span>
                <span className="analysis__prior">{percent(candidate.prior)}</span>
                {result && (
                  <span className="analysis__result">
                    {leadLabel(result.lead)}
                    {delta !== undefined &&
                      !candidate.recorded &&
                      ` · ${delta > 0 ? '+' : ''}${delta} vs kifu`}
                  </span>
                )}
                {result && result.replies.length > 0 && (
                  <span className="analysis__result">
                    Réponses ·{' '}
                    {result.replies
                      .slice(0, 3)
                      .map(({ point }) => pointToHuman(point))
                      .join(' · ')}
                    {result.replies.length > 3 && ` · +${result.replies.length - 3}`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AnalysisPanel() {
  const game = useCurrentGame();
  const base = useStore((s) => s.move);
  const path = useStore((s) => s.variation);
  const status = useEngine((s) => s.status);
  const progress = useEngine((s) => s.progress);
  const error = useEngine((s) => s.error);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  if (!game) return null;
  const scene = reflectionsOf(game).find(({ after }) => after === base);

  return (
    <section className="study reflection analysis" aria-labelledby="analysis-title">
      <header>
        <h2 id="analysis-title" tabIndex={-1} ref={title}>
          Lire les variantes
        </h2>
        <p>
          KataGo propose des coups pour les deux camps. Le pourcentage indique la préférence
          initiale du réseau. L’avance affichée est estimée après le coup.
        </p>
      </header>
      <button type="button" className="chip" onClick={() => useStore.getState().setMode('lire')}>
        Lire 60 coups d’avance
      </button>
      {status === 'ready' ? (
        <AnalysisTree key={`${game.id}:${base}`} game={game} base={base} path={path} />
      ) : status === 'loading' ? (
        <label className="analysis__progress">
          Chargement de KataGo
          <progress value={progress} />
        </label>
      ) : (
        <div className="study__actions">
          {error && <p role="status">KataGo n’a pas démarré ({error}).</p>}
          <button type="button" className="chip chip--accent" onClick={loadEngine}>
            {status === 'failed' ? 'Relancer KataGo' : 'Lancer KataGo'}
          </button>
        </div>
      )}
      <p className="reflection__source">
        Le moteur explore deux coups à partir de chaque position, sans recherche profonde. Ses choix
        reflètent un réseau moderne. Les intentions de Shūsaku restent inconnues.
      </p>
      <button
        type="button"
        className="chip"
        onClick={() => {
          const s = useStore.getState();
          if (scene) s.showReflection(scene.after);
          else s.setMode('lecture');
        }}
      >
        {scene ? 'Revenir à la réflexion' : 'Revenir au kifu'}
      </button>
    </section>
  );
}
