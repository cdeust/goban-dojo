import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { pointToHuman } from '../domain/board.ts';
import { decodePoints, type GameRecord } from '../domain/game.ts';
import { analyzeZero, useZeroEngine } from '../engine/zeroClient.ts';
import { blackWinLabel, previewZeroLines, type SimulationLine } from '../state/zeroReading.ts';
import { reflectionLines, reflectionsOf } from '../state/reflections.ts';
import { timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName } from '../story/format.ts';
import { reflectionMoves } from '../story/reflections.ts';

const FRAME_MS = 230;
const BRANCH_HOLD = 750;
const finished = new WeakMap<GameRecord, Map<number, SimulationLine[]>>();

function Replay({ game, anchor }: { game: GameRecord; anchor: number }) {
  const status = useZeroEngine((s) => s.status);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState<boolean>(Boolean(reduced));
  const [lines, setLines] = useState<SimulationLine[] | undefined>(() =>
    finished.get(game)?.get(anchor),
  );
  const [done, setDone] = useState(() => Boolean(finished.get(game)?.has(anchor)));
  const [failed, setFailed] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [{ index, step }, setFrame] = useState({ index: 0, step: 0 });
  const moves = timelineOf(game).moves;
  const recorded = moves[anchor]!;
  const history = useMemo(() => moves.slice(0, anchor), [moves, anchor]);
  const setup = useMemo(() => decodePoints(game.setupBlack), [game]);
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

  const cached = finished.get(game)?.get(anchor);
  useEffect(() => {
    if (cached) return;
    const controller = new AbortController();
    void previewZeroLines(
      analyzeZero,
      { setupBlack: setup, komi: game.komi, moves: history, next: recorded.color },
      controller.signal,
      (line, branchIndex) => {
        if (!controller.signal.aborted)
          setLines((current) => {
            const next = (current ?? []).slice();
            next[branchIndex] = line;
            return next;
          });
      },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const positions = finished.get(game) ?? new Map<number, SimulationLine[]>();
        positions.set(anchor, result);
        finished.set(game, positions);
        setLines(result);
        setDone(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [cached, game, anchor, setup, history, recorded]);

  const unavailable = failed || status === 'failed' || (done && lines?.length === 0);
  const shown = unavailable && !lines?.length ? fallback : lines;
  const allReceived = unavailable || done;
  const branch = shown?.[index];
  const visibleStep = showStart ? 0 : step;
  const current = visibleStep ? branch?.moves[visibleStep - 1] : undefined;
  const simulatedMoves = branch?.moves;

  useEffect(() => {
    showSimulation(simulatedMoves?.slice(0, visibleStep) ?? []);
  }, [showSimulation, simulatedMoves, visibleStep]);

  useEffect(() => {
    if (paused || showStart || !shown) return;
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
                : 'Leela Zero prépare les variantes…'}
        </p>
      </div>
      <p className="simulation__source">
        {unavailable && !lines?.length
          ? 'Recherche Leela Zero indisponible' + (branch ? ' · variante pédagogique' : '')
          : 'Leela Zero · reproduction d’AlphaGo Zero · komi 7,5 · score de surface'}
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
