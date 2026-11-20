import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { POINTS, pointToHuman } from '../domain/board.ts';
import { decodePoints, type GameRecord } from '../domain/game.ts';
import { nextVariationStep, VARIATION_STEP_MS } from '../replay/variationClock.ts';
import { analyzeZero, useZeroEngine } from '../engine/zeroClient.ts';
import {
  extendZeroLine,
  PREVIEW_BRANCHES,
  PREVIEW_DEPTH,
  previewZeroLines,
  type SimulationLine,
} from '../state/zeroReading.ts';
import { reflectionLines, reflectionsOf } from '../state/reflections.ts';
import type { MoveScore } from '../state/variationScores.ts';
import { nextColor, timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName } from '../story/format.ts';
import { IconPause, IconPlay } from './icons.tsx';
import { useVariationScores } from './useVariationScores.ts';
import { reflectionMoves } from '../story/reflections.ts';

const scoreNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const signedScore = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

function estimatedLead(blackLead: number) {
  const lead = scoreNumber.format(Math.abs(blackLead));
  return lead === '0' ? 'Équilibre' : (blackLead > 0 ? 'Noir +' : 'Blanc +') + lead + ' pt';
}

function komiPoints(komi: number) {
  const points = scoreNumber.format(Math.abs(komi));
  return points === '0' ? '0 pt' : points + ' pt pour ' + (komi > 0 ? 'Blanc' : 'Noir');
}

function bestGain(scores: ReadonlyMap<number, MoveScore>) {
  let best: { point: number; gain: number } | undefined;
  for (const [point, { gain }] of scores) {
    if (!best || gain > best.gain) best = { point, gain };
  }
  return best;
}

const BRANCH_HOLD = 750;
const finished = new WeakMap<GameRecord, Map<number, SimulationLine[]>>();

type PreviewRequest =
  | { kind: 'branches'; target: number; existing: SimulationLine[]; initial?: boolean }
  | { kind: 'depth'; target: number; index: number; line: SimulationLine };

interface ReplayProps {
  game: GameRecord;
  anchor: number;
  onClose?: () => void;
}

function Replay({ game, anchor, onClose }: ReplayProps) {
  const afterResignation = onClose !== undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useZeroEngine((s) => s.status);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState<boolean>(afterResignation || Boolean(reduced));
  const [cached] = useState(() => finished.get(game)?.get(anchor));
  const [lines, setLines] = useState<SimulationLine[]>(cached ?? []);
  const [request, setRequest] = useState<PreviewRequest | null>(
    cached ? null : { kind: 'branches', target: PREVIEW_BRANCHES, existing: [], initial: true },
  );
  const active = useRef<AbortController | null>(null);
  const [exhausted, setExhausted] = useState(Boolean(cached && cached.length < PREVIEW_BRANCHES));
  const [width, setWidth] = useState<number>(PREVIEW_BRANCHES);
  const [depth, setDepth] = useState<number>(PREVIEW_DEPTH);
  const [failure, setFailure] = useState<{ job: PreviewRequest; message: string } | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [{ index, step }, setFrame] = useState({ index: 0, step: 0 });
  const moves = timelineOf(game).moves;
  const [next] = useState(() => nextColor({ ...useStore.getState(), move: anchor, variation: [] }));
  const history = useMemo(() => moves.slice(0, anchor), [moves, anchor]);
  const setup = useMemo(() => decodePoints(game.setupBlack), [game]);
  const position = useMemo(
    () => ({ setupBlack: setup, komi: game.komi, moves: history, next }),
    [setup, game.komi, history, next],
  );
  const scene = afterResignation
    ? undefined
    : reflectionsOf(game).find(({ after }) => after === anchor);
  const fallback = useMemo<SimulationLine[]>(
    () =>
      (scene ? reflectionLines(game, scene) : [])
        .filter((line) => line.variation)
        .map((line) => ({
          moves: reflectionMoves(game, anchor, line),
        })),
    [game, scene, anchor],
  );
  const showSimulation = useStore((s) => s.showSimulation);
  const showReading = useStore((s) => s.showReading);
  const reveal = useStore((s) => s.revealReflectionMove);
  const examine = useStore((s) => s.showReflection);

  useEffect(() => {
    if (afterResignation || useStore.getState().reflectionReplay === 'manual')
      heading.current?.focus({ preventScroll: true });
  }, [afterResignation]);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    const updateLine = (line: SimulationLine, branchIndex: number) => {
      if (signal.aborted) return;
      setLines((current) => {
        const next = current.slice();
        next[branchIndex] = line;
        return next;
      });
    };
    async function calculate(job: PreviewRequest) {
      if (job.kind === 'depth') {
        const result = await extendZeroLine(
          analyzeZero,
          position,
          job.line,
          job.target,
          signal,
          (line) => updateLine(line, job.index),
        );
        updateLine(result, job.index);
        return;
      }
      const result = await previewZeroLines(analyzeZero, position, signal, updateLine, {
        branches: job.target,
        depth: PREVIEW_DEPTH,
        existing: job.existing,
      });
      if (signal.aborted) return;
      setLines(result);
      setExhausted(result.length < job.target);
      if (job.initial && result.length) {
        const positions = finished.get(game) ?? new Map<number, SimulationLine[]>();
        positions.set(anchor, result);
        finished.set(game, positions);
      }
    }
    void calculate(request)
      .catch((error: unknown) => {
        if (!signal.aborted) {
          setFailure({
            job: request,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (!signal.aborted) setRequest(null);
      });
    return () => controller.abort();
  }, [request, position, game, anchor]);

  function runManual(next: PreviewRequest | null) {
    active.current?.abort();
    setPaused(true);
    setFailure(null);
    setRequest(next);
  }

  const failed = failure !== null || status === 'failed';
  const unavailable = failed || (exhausted && !lines.length);

  function retrySearch() {
    const job = failure?.job;
    setFailure(null);
    setExhausted(false);
    if (job?.kind === 'depth') {
      setRequest({ ...job, line: lines[job.index] ?? job.line });
      return;
    }
    // Une branche peut avoir été publiée avant l’interruption de sa recherche.
    // Garder les suites terminées et reprendre au premier départ incomplet.
    const existing = lines.filter((line) => line.complete || line.moves.length >= PREVIEW_DEPTH);
    if (index >= existing.length) {
      setFrame({ index: existing.length, step: 0 });
      setShowStart(false);
    }
    setLines(existing);
    setRequest({
      kind: 'branches',
      target: job?.target ?? width,
      existing,
      initial: job?.initial ?? true,
    });
  }

  const shown = unavailable && !lines.length ? fallback : lines;
  const allReceived = request === null;
  const branch = shown?.[index];
  const visibleStep = showStart ? 0 : step;
  const current = visibleStep ? branch?.moves[visibleStep - 1] : undefined;
  const simulatedMoves = branch?.moves;
  const recorded = afterResignation ? undefined : moves[anchor];
  const starts = useMemo(() => {
    const points = new Set<number>();
    for (const line of shown) {
      if (line.moves[0]) points.add(line.moves[0].point);
    }
    if (recorded) points.add(recorded.point);
    return [...points];
  }, [shown, recorded]);
  const compareTurn = paused && visibleStep >= 2;
  const scores = useVariationScores(
    position,
    simulatedMoves ?? [],
    visibleStep,
    starts,
    compareTurn,
  );
  const positionScore = current ? scores.visible : scores.root;
  const recordedScore = recorded && scores.starts.get(recorded.point);
  const best = bestGain(scores.starts);
  const bestBranch = best ? shown.findIndex((line) => line.moves[0]?.point === best.point) : -1;
  const bestReply = bestGain(scores.siblings);
  const ranked = shown
    .map((line, i) => {
      const first = line.moves[0];
      return { i, first, score: first && scores.starts.get(first.point) };
    })
    .sort((a, b) => {
      if (!a.score) return b.score ? 1 : 0;
      return b.score ? b.score.gain - a.score.gain : -1;
    });

  useEffect(() => {
    const moves = simulatedMoves?.slice(0, visibleStep) ?? [];
    if (afterResignation) showReading(moves, null, null);
    else showSimulation(moves);
  }, [afterResignation, showReading, showSimulation, simulatedMoves, visibleStep]);

  function selectBranch(i: number) {
    if (request?.kind === 'depth') runManual(null);
    setPaused(true);
    setShowStart(false);
    setFrame({ index: i, step: 1 });
  }

  const available = branch?.moves.length ?? 0;
  const hasNextBranch = index + 1 < shown.length;
  const dueAt = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      !available ||
      paused ||
      showStart ||
      (step >= available && !hasNextBranch && (!allReceived || unavailable))
    ) {
      dueAt.current = undefined;
      return;
    }
    const now = performance.now();
    const deadline = dueAt.current ?? now + (step < available ? VARIATION_STEP_MS : BRANCH_HOLD);
    dueAt.current = deadline;
    const timer = window.setTimeout(
      () => {
        if (step < available) {
          const frame = nextVariationStep(step, available, deadline, performance.now());
          dueAt.current = frame.nextDue;
          setFrame({ index, step: frame.step });
        } else {
          dueAt.current = undefined;
          if (hasNextBranch) setFrame({ index: index + 1, step: 0 });
          else if (afterResignation) setPaused(true);
          else reveal();
        }
      },
      Math.max(0, deadline - now),
    );
    return () => window.clearTimeout(timer);
  }, [
    paused,
    showStart,
    step,
    available,
    hasNextBranch,
    allReceived,
    index,
    afterResignation,
    unavailable,
    reveal,
  ]);

  return (
    <section
      className={afterResignation ? 'simulation simulation--resignation' : 'simulation'}
      aria-labelledby="simulation-title"
    >
      <div className="simulation__body">
        <header className="simulation__header">
          <h2 id="simulation-title" ref={heading} tabIndex={-1}>
            {afterResignation
              ? 'Variantes après l’abandon'
              : colorName(next) + ' · avant le coup ' + (anchor + 1)}
          </h2>
        </header>
        <div
          className="simulation__navigation"
          role="group"
          aria-label="Parcourir la variante"
          onFocus={() => setPaused(true)}
        >
          <div className="simulation__field">
            <label htmlFor="simulation-branch">Variante affichée</label>
            <select
              id="simulation-branch"
              value={branch ? index : ''}
              disabled={!branch}
              onChange={(event) => selectBranch(Number(event.target.value))}
            >
              {!branch && <option value="">—</option>}
              {ranked.map(({ i, first, score }, rank) => (
                <option key={i} value={i}>
                  {score ? rank + 1 : '…'}
                  {first && ' · ' + pointToHuman(first.point)}
                  {score && ' · ' + signedScore.format(score.gain) + ' pt'}
                </option>
              ))}
            </select>
          </div>
          <label className="simulation__scrub">
            Coup{' '}
            <span aria-hidden="true">
              {visibleStep} / {available}
            </span>
            <input
              aria-label="Coup de la variante"
              aria-valuetext={visibleStep + ' sur ' + available}
              type="range"
              min="0"
              max={available}
              disabled={!available}
              value={visibleStep}
              onChange={(event) => {
                setPaused(true);
                setShowStart(false);
                setFrame({ index, step: Number(event.target.value) });
              }}
            />
          </label>
          <button
            type="button"
            className="chip simulation__origin"
            disabled={step === 0}
            aria-pressed={showStart}
            onClick={() => {
              setPaused(true);
              setShowStart(!showStart);
            }}
          >
            Position initiale
          </button>
        </div>
        <div className="simulation__overview">
          {afterResignation && (
            <p className="simulation__current">
              {colorName(next)} au trait · suites hypothétiques depuis la position finale du kifu.
            </p>
          )}
          <div
            className="simulation__view"
            data-branch={branch ? index + 1 : undefined}
            data-step={visibleStep}
          >
            <p className="simulation__current">
              {current
                ? 'Coup simulé · ' + colorName(current.color) + ' ' + pointToHuman(current.point)
                : branch
                  ? 'Position initiale · coups du kifu'
                  : unavailable
                    ? failed
                      ? 'Simulation interrompue'
                      : 'Aucune variante disponible'
                    : request
                      ? 'Leela Zero prépare les variantes…'
                      : 'Recherche arrêtée'}
            </p>
            {positionScore ? (
              <dl className="simulation__score">
                <div>
                  <dt>Avance estimée</dt>
                  <dd>{estimatedLead(positionScore.blackLead)}</dd>
                </div>
                {current && scores.visible && (
                  <div>
                    <dt>Variation pour {colorName(current.color)}</dt>
                    <dd>{signedScore.format(scores.visible.gain)} pt</dd>
                  </div>
                )}
                <div>
                  <dt>Komi d’équilibre estimé</dt>
                  <dd>{komiPoints(positionScore.evenKomi)}</dd>
                </div>
              </dl>
            ) : (
              <p className="simulation__source">
                {scores.error
                  ? 'Score indisponible pour cette position.'
                  : 'Estimation du score en cours…'}
              </p>
            )}
            {compareTurn && current && (
              <p className="simulation__comparison simulation__reply">
                {bestReply && scores.visible && scores.siblings.size > 1 ? (
                  <>
                    {bestReply.point === current.point
                      ? 'Ce coup est en tête'
                      : pointToHuman(bestReply.point) +
                        ' conserverait ' +
                        scoreNumber.format(bestReply.gain - scores.visible.gain) +
                        ' pt de plus'}
                    {' sur ' + scores.siblings.size + ' réponses évaluées à ce tour.'}
                    {scores.siblingsPending && ' Comparaison en cours…'}
                  </>
                ) : scores.error ? (
                  'Comparaison des réponses indisponible.'
                ) : scores.siblingsPending ? (
                  'Comparaison des réponses en cours…'
                ) : (
                  'Une seule réponse évaluée à ce tour.'
                )}
              </p>
            )}
          </div>
          {failed && (
            <p className="simulation__source" role="status">
              Leela Zero n’a pas terminé la recherche. Vous pouvez la relancer depuis cette
              position.
            </p>
          )}
          {scores.error && (
            <button type="button" className="chip" onClick={scores.retry}>
              Réessayer l’estimation du score
            </button>
          )}
          {best && (
            <p className="simulation__comparison">
              {scores.starts.size === 1
                ? 'Premier coup évalué'
                : 'Meilleur départ sur ' + scores.starts.size + ' coups évalués'}
              {' · '}
              {bestBranch >= 0 ? (
                <button
                  type="button"
                  className="simulation__best"
                  aria-label={'Voir la variante en ' + pointToHuman(best.point)}
                  onClick={() => selectBranch(bestBranch)}
                >
                  {colorName(next)} {pointToHuman(best.point)}
                </button>
              ) : (
                <strong>
                  {colorName(next)} {pointToHuman(best.point)}
                </strong>
              )}
              {' (' + signedScore.format(best.gain) + ' pt)'}
              {recorded &&
                (best.point === recorded.point
                  ? ' · Coup du kifu'
                  : ' · Kifu ' +
                    pointToHuman(recorded.point) +
                    (recordedScore
                      ? ' · écart ' + scoreNumber.format(best.gain - recordedScore.gain) + ' pt'
                      : scores.error
                        ? ' · score indisponible'
                        : ' · estimation en cours'))}
            </p>
          )}
        </div>
        <details
          className="simulation__study"
          onToggle={(event) => {
            if (event.currentTarget.open) setPaused(true);
          }}
        >
          <summary>Plus de variantes et de coups</summary>
          <div className="simulation__options">
            <div className="simulation__field">
              <label htmlFor="simulation-width">Nombre de variantes</label>
              <select
                id="simulation-width"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              >
                {[6, PREVIEW_BRANCHES, 12, 24, 60, 120, POINTS + 1].map((count) => (
                  <option key={count} value={count}>
                    {count === POINTS + 1 ? 'Tous les coups légaux' : count}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="chip"
              disabled={
                exhausted ||
                lines.length >= width ||
                (request?.kind === 'branches' && request.target === width)
              }
              onClick={() => {
                if (!lines[index]) {
                  setShowStart(false);
                  setFrame({ index: 0, step: 0 });
                }
                runManual({ kind: 'branches', target: width, existing: lines });
              }}
            >
              Chercher les variantes
            </button>
            <div className="simulation__field">
              <label htmlFor="simulation-depth">Profondeur de la variante</label>
              <select
                id="simulation-depth"
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
              >
                {[16, PREVIEW_DEPTH, 32, 60, 120, 240, 480].map((count) => (
                  <option key={count} value={count}>
                    {count} coups
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="chip"
              disabled={
                !lines[index] ||
                branch?.complete ||
                (branch?.moves.length ?? 0) >= depth ||
                (request?.kind === 'depth' && request.index === index && request.target === depth)
              }
              onClick={() => {
                const line = lines[index];
                if (line) runManual({ kind: 'depth', index, line, target: depth });
              }}
            >
              Prolonger la variante
            </button>
          </div>
          <p className="simulation__progress" role="status">
            {request?.kind === 'branches'
              ? lines.length + ' / ' + request.target + ' variantes disponibles'
              : request?.kind === 'depth'
                ? (lines[request.index]?.moves.length ?? 0) +
                  ' / ' +
                  request.target +
                  ' coups disponibles'
                : failed
                  ? 'Recherche interrompue par une erreur'
                  : exhausted
                    ? 'Tous les premiers coups légaux ont été examinés.'
                    : branch?.complete
                      ? 'Fin de cette variante.'
                      : lines.length +
                        (lines.length === 1 ? ' variante disponible' : ' variantes disponibles')}
          </p>
          {request && (
            <button type="button" className="chip" onClick={() => runManual(null)}>
              Arrêter la recherche
            </button>
          )}
          {!afterResignation && (
            <button type="button" className="chip" onClick={() => examine(anchor)}>
              Examiner
            </button>
          )}
          {failure && <p className="simulation__source">{failure.message}</p>}
          <p className="simulation__source">
            {failed && !lines.length
              ? branch
                ? 'Variante pédagogique'
                : 'Recherche Leela Zero indisponible'
              : 'Suites Leela Zero'}
            {' · Score KataGo en règles japonaises · '}
            {game.komi === undefined ? 'Komi retenu ' : 'Komi du kifu '}
            {komiPoints(game.komi ?? 0)}
          </p>
        </details>
      </div>
      <div className="simulation__controls" role="group" aria-label="Commandes de la simulation">
        {unavailable && !request && (
          <button type="button" className="chip" onClick={retrySearch}>
            Réessayer les simulations
          </button>
        )}
        <button
          type="button"
          className="chip"
          disabled={!available && unavailable}
          aria-label={paused ? 'Lire les variantes' : 'Pause des variantes'}
          onClick={() => {
            setShowStart(false);
            if (
              afterResignation &&
              paused &&
              branch &&
              index + 1 === shown.length &&
              step === branch.moves.length
            ) {
              setFrame({ index: 0, step: 0 });
            }
            setPaused(!paused);
          }}
        >
          {paused ? <IconPlay /> : <IconPause />}
          {paused ? 'Lire' : 'Pause'}
        </button>
        <button
          type="button"
          className="chip"
          aria-label="Coup simulé suivant"
          disabled={!available || (visibleStep >= available && !hasNextBranch)}
          onClick={() => {
            setPaused(true);
            setShowStart(false);
            setFrame(
              visibleStep < available
                ? { index, step: visibleStep + 1 }
                : { index: index + 1, step: 1 },
            );
          }}
        >
          Suivant
        </button>
        {onClose ? (
          <button
            type="button"
            className="chip chip--accent"
            onClick={() => {
              active.current?.abort();
              showReading([], null, null);
              onClose();
            }}
          >
            Revenir à la lecture longue
          </button>
        ) : (
          <button
            type="button"
            className="chip chip--accent"
            onClick={(event) => {
              const cursor = event.currentTarget
                .closest('.stage')
                ?.querySelector<HTMLInputElement>('.transport__scrub input');
              reveal();
              requestAnimationFrame(() => cursor?.focus({ preventScroll: true }));
            }}
          >
            Jouer le coup du kifu
          </button>
        )}
      </div>
    </section>
  );
}

export function ResignationReplay({ game, anchor, onClose }: Required<ReplayProps>) {
  return <Replay key={game.id + ':' + anchor} game={game} anchor={anchor} onClose={onClose} />;
}

export function ReflectionReplay() {
  const game = useCurrentGame();
  const anchor = useStore((s) => s.move);
  const replay = useStore((s) => s.reflectionReplay);
  if (!game || (replay !== 'auto' && replay !== 'manual') || !timelineOf(game).moves[anchor])
    return null;
  return <Replay key={game.id + ':' + anchor} game={game} anchor={anchor} />;
}
