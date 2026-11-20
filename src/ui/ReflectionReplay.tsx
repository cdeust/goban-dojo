import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { POINTS, pointToHuman } from '../domain/board.ts';
import { decodePoints, type GameRecord } from '../domain/game.ts';
import { analyzeZero, useZeroEngine } from '../engine/zeroClient.ts';
import {
  blackWinLabel,
  extendZeroLine,
  previewZeroLines,
  type SimulationLine,
} from '../state/zeroReading.ts';
import { reflectionLines, reflectionsOf } from '../state/reflections.ts';
import { timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName } from '../story/format.ts';
import { reflectionMoves } from '../story/reflections.ts';

const FRAME_MS = 230;
const BRANCH_HOLD = 750;
const REPLAY_BRANCHES = 4;
const REPLAY_DEPTH = 12;
const finished = new WeakMap<GameRecord, Map<number, SimulationLine[]>>();

type PreviewRequest =
  | { kind: 'branches'; target: number; existing: SimulationLine[]; initial?: boolean }
  | { kind: 'depth'; target: number; index: number; line: SimulationLine };

function Replay({ game, anchor }: { game: GameRecord; anchor: number }) {
  const status = useZeroEngine((s) => s.status);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState<boolean>(Boolean(reduced));
  const [cached] = useState(() => finished.get(game)?.get(anchor));
  const [lines, setLines] = useState<SimulationLine[]>(cached ?? []);
  const [request, setRequest] = useState<PreviewRequest | null>(
    cached ? null : { kind: 'branches', target: REPLAY_BRANCHES, existing: [], initial: true },
  );
  const active = useRef<AbortController | null>(null);
  const [exhausted, setExhausted] = useState(Boolean(cached && cached.length < REPLAY_BRANCHES));
  const [width, setWidth] = useState(6);
  const [depth, setDepth] = useState(16);
  const [failed, setFailed] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [{ index, step }, setFrame] = useState({ index: 0, step: 0 });
  const moves = timelineOf(game).moves;
  const recorded = moves[anchor]!;
  const history = useMemo(() => moves.slice(0, anchor), [moves, anchor]);
  const setup = useMemo(() => decodePoints(game.setupBlack), [game]);
  const position = useMemo(
    () => ({ setupBlack: setup, komi: game.komi, moves: history, next: recorded.color }),
    [setup, game.komi, history, recorded.color],
  );
  const scene = reflectionsOf(game).find(({ after }) => after === anchor)!;
  const fallback = useMemo<SimulationLine[]>(
    () =>
      reflectionLines(game, scene)
        .filter((line) => line.variation)
        .map((line) => ({
          moves: reflectionMoves(game, anchor, line),
        })),
    [game, scene, anchor],
  );
  const showSimulation = useStore((s) => s.showSimulation);
  const reveal = useStore((s) => s.revealReflectionMove);
  const examine = useStore((s) => s.showReflection);

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
        depth: REPLAY_DEPTH,
        existing: job.existing,
      });
      if (signal.aborted) return;
      setLines(result);
      setExhausted(result.length < job.target);
      if (job.initial) {
        const positions = finished.get(game) ?? new Map<number, SimulationLine[]>();
        positions.set(anchor, result);
        finished.set(game, positions);
      }
    }
    void calculate(request)
      .catch(() => {
        if (!signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!signal.aborted) setRequest(null);
      });
    return () => controller.abort();
  }, [request, position, game, anchor]);

  function runManual(next: PreviewRequest | null) {
    active.current?.abort();
    setPaused(true);
    setFailed(false);
    setRequest(next);
  }

  const unavailable = failed || status === 'failed' || (exhausted && !lines.length);
  const shown = unavailable && !lines.length ? fallback : lines;
  const allReceived = request === null;
  const branch = shown?.[index];
  const visibleStep = showStart ? 0 : step;
  const current = visibleStep ? branch?.moves[visibleStep - 1] : undefined;
  const simulatedMoves = branch?.moves;

  useEffect(() => {
    showSimulation(simulatedMoves?.slice(0, visibleStep) ?? []);
  }, [showSimulation, simulatedMoves, visibleStep]);

  useEffect(() => {
    if (paused || showStart) return;
    const complete = !branch || step >= branch.moves.length;
    if (complete && index + 1 >= shown.length && !allReceived) return;
    const timer = window.setTimeout(
      () => {
        if (!complete) setFrame({ index, step: step + 1 });
        else if (index + 1 < shown.length) setFrame({ index: index + 1, step: 0 });
        else reveal();
      },
      complete ? BRANCH_HOLD : FRAME_MS,
    );
    return () => window.clearTimeout(timer);
  }, [paused, shown, branch, index, step, reveal, allReceived, showStart]);

  return (
    <section className="simulation" aria-labelledby="simulation-title">
      <header className="simulation__header">
        <h2 id="simulation-title">
          {colorName(recorded.color)} · avant le coup {anchor + 1}
        </h2>
        <span>
          {branch
            ? 'Variante ' + (index + 1) + (allReceived ? ' / ' + shown?.length : '')
            : 'Lecture des variantes'}
        </span>
      </header>
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
                ? 'Aucune variante disponible'
                : request
                  ? 'Leela Zero prépare les variantes…'
                  : 'Recherche arrêtée'}
        </p>
      </div>
      <p className="simulation__source">
        {unavailable && !lines?.length
          ? 'Recherche Leela Zero indisponible' + (branch ? ' · variante pédagogique' : '')
          : 'Leela Zero · reproduction d’AlphaGo Zero · komi 7,5 · score de surface'}
        {branch?.excluded &&
          branch.excluded.length > 0 &&
          ' · Recherche alternative après exclusion de ' +
            (branch.excluded.length <= REPLAY_BRANCHES
              ? branch.excluded.map(pointToHuman).join(', ')
              : branch.excluded.length + ' premiers coups')}
        {branch?.blackWin !== undefined &&
          ' · ' + blackWinLabel(branch.blackWin) + ' après le premier coup'}
        {' · Halo bleu · coup simulé'}
      </p>
      <div className="simulation__controls" role="group" aria-label="Commandes de la simulation">
        <button
          type="button"
          className="chip"
          onClick={() => {
            setShowStart(false);
            setPaused(!paused);
          }}
        >
          {paused ? 'Lire les variantes' : 'Pause des variantes'}
        </button>
        {step > 0 && (
          <button
            type="button"
            className="chip"
            aria-pressed={showStart}
            onClick={() => {
              setPaused(true);
              setShowStart(!showStart);
            }}
          >
            Position initiale
          </button>
        )}
        {paused && !showStart && branch && (
          <button
            type="button"
            className="chip"
            disabled={step === branch.moves.length && index + 1 === shown?.length}
            onClick={() =>
              setFrame(
                step < branch.moves.length
                  ? { index, step: step + 1 }
                  : { index: index + 1, step: 0 },
              )
            }
          >
            Coup simulé suivant
          </button>
        )}
        <button type="button" className="chip" onClick={() => examine(anchor)}>
          Examiner
        </button>
        <button type="button" className="chip chip--accent" onClick={reveal}>
          Jouer le coup du kifu
        </button>
      </div>
      <details
        className="simulation__study"
        onToggle={(event) => {
          if (event.currentTarget.open) setPaused(true);
        }}
      >
        <summary>Plus de variantes et de coups</summary>
        <div className="simulation__options">
          {shown.length > 0 && (
            <>
              <div className="simulation__field">
                <label htmlFor="simulation-branch">Variante affichée</label>
                <select
                  id="simulation-branch"
                  value={index}
                  onChange={(event) => {
                    if (request?.kind === 'depth') runManual(null);
                    setPaused(true);
                    setShowStart(false);
                    setFrame({ index: Number(event.target.value), step: 1 });
                  }}
                >
                  {shown.map((line, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                      {line.moves[0] && ' · ' + pointToHuman(line.moves[0].point)}
                    </option>
                  ))}
                </select>
              </div>
              <label>
                Coup de la variante{' '}
                <span aria-hidden="true">
                  · {visibleStep} / {branch?.moves.length}
                </span>
                <input
                  aria-label="Coup de la variante"
                  aria-valuetext={visibleStep + ' sur ' + branch?.moves.length}
                  type="range"
                  min="0"
                  max={branch?.moves.length ?? 0}
                  value={visibleStep}
                  onChange={(event) => {
                    setPaused(true);
                    setShowStart(false);
                    setFrame({ index, step: Number(event.target.value) });
                  }}
                />
              </label>
            </>
          )}
          <div className="simulation__field">
            <label htmlFor="simulation-width">Nombre de variantes</label>
            <select
              id="simulation-width"
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            >
              {[6, 12, 24, 60, 120, POINTS + 1].map((count) => (
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
              {[16, 32, 60, 120, 240, 480].map((count) => (
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
      </details>
    </section>
  );
}

export function ReflectionReplay() {
  const game = useCurrentGame();
  const anchor = useStore((s) => s.move);
  const replay = useStore((s) => s.reflectionReplay);
  if (!game || (replay !== 'auto' && replay !== 'manual') || !timelineOf(game).moves[anchor])
    return null;
  return <Replay key={game.id + ':' + anchor} game={game} anchor={anchor} />;
}
