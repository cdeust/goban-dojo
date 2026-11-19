import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { pointToHuman } from '../domain/board.ts';
import { decodePoints, type GameRecord } from '../domain/game.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { previewLines, type PreviewLine } from '../engine/preview.ts';
import { reflectionLines, reflectionsOf } from '../state/reflections.ts';
import { timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName, formatLead } from '../story/format.ts';
import { reflectionMoves } from '../story/reflections.ts';

const FRAME_MS = 230;
const BRANCH_HOLD = 750;
const finished = new WeakMap<GameRecord, Map<number, PreviewLine[]>>();

function Replay({ game, anchor }: { game: GameRecord; anchor: number }) {
  const status = useEngine((s) => s.status);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState<boolean>(Boolean(reduced));
  const [lines, setLines] = useState<PreviewLine[] | undefined>(() =>
    finished.get(game)?.get(anchor),
  );
  const [done, setDone] = useState(() => Boolean(finished.get(game)?.has(anchor)));
  const [failed, setFailed] = useState(false);
  const [{ index, step }, setFrame] = useState({ index: 0, step: 0 });
  const moves = timelineOf(game).moves;
  const recorded = moves[anchor]!;
  const history = useMemo(() => moves.slice(0, anchor), [moves, anchor]);
  const setup = useMemo(() => decodePoints(game.setupBlack), [game]);
  const scene = reflectionsOf(game).find(({ after }) => after === anchor)!;
  const fallback = useMemo(
    () =>
      reflectionLines(game, scene)
        .filter((line) => line.variation)
        .map((line) => ({
          moves: reflectionMoves(game, anchor, line),
          estimates: [],
        })),
    [game, scene, anchor],
  );
  const showSimulation = useStore((s) => s.showSimulation);
  const reveal = useStore((s) => s.revealReflectionMove);
  const examine = useStore((s) => s.showReflection);

  useEffect(() => {
    if (status === 'idle') loadEngine();
  }, [status]);

  const cached = finished.get(game)?.get(anchor);
  useEffect(() => {
    if (status !== 'ready' || cached) return;
    const controller = new AbortController();
    void previewLines(
      evaluate,
      { setupBlack: setup, komi: game.komi, moves: history, next: recorded.color },
      recorded,
      controller.signal,
      (line, index) =>
        setLines((current) => {
          const next = [...(current ?? [])];
          next[index] = line;
          return next;
        }),
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const positions = finished.get(game) ?? new Map<number, PreviewLine[]>();
        positions.set(anchor, result);
        finished.set(game, positions);
        setLines(result);
        setDone(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [status, cached, game, anchor, setup, history, recorded]);

  const unavailable = failed || status === 'failed' || (done && lines?.length === 0);
  const shown = unavailable && !lines?.length ? fallback : lines;
  const allReceived = unavailable || done;
  const branch = shown?.[index];
  const current = step ? branch?.moves[step - 1] : undefined;
  const estimate = step ? branch?.estimates[step - 1] : undefined;
  const simulatedMoves = branch?.moves;

  useEffect(() => {
    showSimulation(simulatedMoves?.slice(0, step) ?? []);
  }, [showSimulation, simulatedMoves, step]);

  useEffect(() => {
    if (paused || !shown) return;
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
  }, [paused, shown, branch, index, step, reveal, allReceived]);

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
        data-step={step}
      >
        <p className="simulation__current">
          {current
            ? colorName(current.color) +
              ' ' +
              pointToHuman(current.point) +
              ' · ' +
              step +
              '/' +
              branch?.moves.length
            : branch
              ? 'Position de départ'
              : unavailable
                ? 'Aucune variante disponible'
                : 'KataGo prépare les variantes…'}
          {estimate !== undefined && <span> · {formatLead(estimate)}</span>}
        </p>
      </div>
      <p className="simulation__source">
        {unavailable && !lines?.length && branch ? 'Variante pédagogique' : 'Simulations KataGo'}
      </p>
      <div className="simulation__controls" role="group" aria-label="Commandes de la simulation">
        <button type="button" className="chip" onClick={() => setPaused(!paused)}>
          {paused ? 'Lire les variantes' : 'Pause des variantes'}
        </button>
        {paused && branch && (
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
