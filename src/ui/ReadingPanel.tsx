import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { opposite, pointToHuman } from '../domain/board.ts';
import { decodePoints } from '../domain/game.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { readLine, READING_DEPTHS, type ReadingStep } from '../engine/reading.ts';
import { nextColor, SPEEDS, timelineOf, useCurrentGame, useStore } from '../state/store.ts';
import { colorName, formatLead } from '../story/format.ts';
import { reflectionsOf } from '../state/reflections.ts';

function moveLabel(step: ReadingStep) {
  return `${colorName(step.move.color)} ${pointToHuman(step.move.point)}`;
}

function tacticalLabel(step: ReadingStep) {
  if (step.rescued.length > 0) return 'Sortie d’atari';
  if (step.threat.captured > 0) return 'Capture';
  if (step.threat.atari.length > 0) return 'Mise en atari';
  if (step.threat.connects.length > 0) return 'Connexion';
  return null;
}

function LeadPlot({ steps, cursor }: { steps: ReadingStep[]; cursor: number }) {
  const first = steps[0];
  if (!first) return null;
  const leads = [first.before, ...steps.map(({ blackLead }) => blackLead)];
  const low = Math.min(0, ...leads);
  const high = Math.max(0, ...leads);
  const plot = (value: number) => 62 - (56 * (value - low)) / (high - low || 1);
  const x = (index: number) => 6 + (228 * index) / steps.length;
  return (
    <figure className="reading__plot">
      <figcaption>Avance estimée de Noir</figcaption>
      <svg viewBox="0 0 240 68" aria-hidden="true">
        <line x1="6" x2="234" y1={plot(0)} y2={plot(0)} className="reading__zero" />
        <polyline points={leads.map((value, i) => `${x(i)},${plot(value)}`).join(' ')} />
        <circle cx={x(cursor)} cy={plot(leads[cursor] ?? first.before)} r="4" />
      </svg>
    </figure>
  );
}

export function ReadingPanel() {
  const game = useCurrentGame();
  const base = useStore((s) => s.move);
  const showMoves = useStore((s) => s.showReading);
  const status = useEngine((s) => s.status);
  const progress = useEngine((s) => s.progress);
  const engineError = useEngine((s) => s.error);
  const [seed] = useState(() => useStore.getState().variation);
  const [mover] = useState(() => nextColor(useStore.getState()));
  const [depth, setDepth] = useState<number>(READING_DEPTHS[0]);
  const [steps, setSteps] = useState<ReadingStep[]>([]);
  const [previous, setPrevious] = useState<ReadingStep[]>();
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string>();
  const [replaying, setReplaying] = useState(false);
  const [pace, setPace] = useState<number>(SPEEDS.at(-1)!);
  const [showOwnership, setOwnership] = useState(false);
  const controller = useRef<AbortController>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    const map = cursor === 0 ? steps[0]?.beforeOwnership : steps[cursor - 1]?.ownership;
    showMoves(
      [...seed, ...steps.slice(0, cursor).map(({ move }) => move)],
      replaying ? pace : null,
      showOwnership ? (map ?? null) : null,
    );
  }, [seed, steps, cursor, replaying, pace, showMoves, showOwnership]);

  useEffect(() => {
    if (!replaying || cursor >= steps.length) return;
    const timer = window.setTimeout(() => setCursor((n) => n + 1), 1000 / pace);
    return () => window.clearTimeout(timer);
  }, [replaying, cursor, steps.length, pace]);

  if (!game) return null;
  const history = timelineOf(game).moves;
  const recorded = seed.length === 0 && history[base]?.color === mover ? history[base] : undefined;
  const scene = reflectionsOf(game).find(({ after }) => after === base);
  const current = steps[cursor - 1];
  const next = steps[cursor];
  const nextTactic = steps.findIndex((step, i) => i >= cursor && tacticalLabel(step) !== null);
  const estimate = current?.blackLead ?? steps[0]?.before;
  const playing = replaying && (cursor < steps.length || running);

  function stop() {
    controller.current?.abort();
    setRunning(false);
  }

  function start(from: number, first?: number) {
    if (!game) return;
    stop();
    const request = new AbortController();
    controller.current = request;
    if (from < steps.length) setPrevious(steps);
    const prefix = steps.slice(0, from);
    const nextColor = prefix.at(-1)?.move.color;
    const position = {
      setupBlack: decodePoints(game.setupBlack),
      moves: [...history.slice(0, base), ...seed, ...prefix.map(({ move }) => move)],
      next: nextColor ? opposite(nextColor) : mover,
    };
    let count = from;
    setSteps(prefix);
    setCursor(from);
    setReplaying(false);
    setRunning(true);
    setEnded(false);
    setError(undefined);
    void readLine(evaluate, position, {
      limit: depth - from,
      ...(first === undefined ? {} : { first }),
      signal: request.signal,
      onStep: (step) => {
        count++;
        setSteps((line) => [...line, step]);
      },
    })
      .then(() => {
        if (!request.signal.aborted) setEnded(count < depth);
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted)
          setError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!request.signal.aborted) setRunning(false);
      });
  }

  function seek(value: number) {
    setReplaying(false);
    setCursor(value);
  }

  return (
    <section className="study reflection reading" aria-labelledby="reading-title">
      <header>
        <h2 id="reading-title" tabIndex={-1} ref={heading}>
          Lecture longue
        </h2>
        <p>Projection d’une suite pour les deux camps à partir du coup {base + seed.length + 1}.</p>
        {scene && seed.length === 0 && <p className="reflection__question">{scene.question}</p>}
      </header>
      {status === 'ready' ? (
        <>
          <label className="study__filter">
            Profondeur de la suite
            <select
              value={depth}
              disabled={running}
              onChange={(event) => setDepth(Number(event.target.value))}
            >
              {READING_DEPTHS.map((length) => (
                <option key={length} value={length}>
                  {length} coups
                </option>
              ))}
            </select>
          </label>
          <div className="study__actions">
            {running ? (
              <button type="button" className="chip" onClick={stop}>
                Arrêter le calcul
              </button>
            ) : (
              <>
                {steps.length < depth && !ended && (
                  <button
                    type="button"
                    className="chip chip--accent"
                    onClick={() => start(steps.length)}
                  >
                    {steps.length ? 'Prolonger la suite' : 'Calculer la suite'}
                  </button>
                )}
                {recorded && (
                  <button type="button" className="chip" onClick={() => start(0, recorded.point)}>
                    Lire après {pointToHuman(recorded.point)} · coup du kifu
                  </button>
                )}
              </>
            )}
          </div>
          {(running || steps.length > 0) && (
            <label className="analysis__progress">
              Coups calculés · {steps.length} / {depth}
              <progress value={steps.length} max={Math.max(depth, steps.length)} />
            </label>
          )}
          <p className="analysis__coverage" role="status">
            {error
              ? `Calcul interrompu (${error}).`
              : ended
                ? 'La suite s’arrête après deux passes.'
                : !running && steps.length > 0
                  ? `${steps.length} coups disponibles`
                  : null}
          </p>
          {steps.length > 0 && (
            <>
              <div className="reading__controls">
                <label>
                  Coup dans la simulation
                  <span aria-hidden="true">
                    {' '}
                    · {cursor} / {steps.length}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={steps.length}
                    value={cursor}
                    aria-valuetext={`Coup ${cursor} sur ${steps.length}`}
                    style={{ '--progress': `${(100 * cursor) / steps.length}%` } as CSSProperties}
                    onChange={(event) => seek(Number(event.target.value))}
                  />
                </label>
                <div className="reading__buttons">
                  <button
                    type="button"
                    className="chip"
                    disabled={cursor === 0}
                    onClick={() => seek(cursor - 1)}
                  >
                    ← Reculer
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      if (playing) setReplaying(false);
                      else {
                        if (cursor === steps.length) setCursor(0);
                        setReplaying(true);
                      }
                    }}
                  >
                    {playing ? 'Pause' : 'Rejouer'}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    disabled={cursor === steps.length}
                    onClick={() => seek(cursor + 1)}
                  >
                    Avancer →
                  </button>
                </div>
                {nextTactic >= 0 && (
                  <button type="button" className="chip" onClick={() => seek(nextTactic + 1)}>
                    Temps fort suivant
                  </button>
                )}
                <label className="study__filter">
                  Cadence
                  <select value={pace} onChange={(event) => setPace(Number(event.target.value))}>
                    {SPEEDS.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed} coup/s
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <LeadPlot steps={steps} cursor={cursor} />
              <button
                type="button"
                className="chip"
                aria-pressed={showOwnership}
                onClick={() => setOwnership(!showOwnership)}
              >
                Territoires estimés
              </button>
              {showOwnership && (
                <p className="reflection__source">
                  Bleu pour Noir, ambre pour Blanc. Les intersections incertaines restent pâles.
                </p>
              )}
              <div className="study__position">
                <h3>{current ? moveLabel(current) : 'Position de départ'}</h3>
                {estimate !== undefined && <p>{formatLead(estimate)}</p>}
                {current && tacticalLabel(current) && <p>{tacticalLabel(current)}</p>}
                {current && current.threat.captured > 0 && (
                  <p>Pierres capturées · {current.threat.captured}</p>
                )}
                {current && current.rescued.length > 0 && (
                  <p>Libertés retrouvées · {current.rescued.map(pointToHuman).join(', ')}</p>
                )}
              </div>
              {next && (
                <div className="reading__fork">
                  <h3>Choix de {colorName(next.move.color)}</h3>
                  <ol className="analysis__choices">
                    {next.choices.map(({ point, blackLead }) => (
                      <li key={point}>
                        <button
                          type="button"
                          className="analysis__choice"
                          aria-pressed={point === next.move.point}
                          onClick={() => {
                            if (point === next.move.point) seek(cursor + 1);
                            else start(cursor, point);
                          }}
                        >
                          <strong>{pointToHuman(point)}</strong>
                          <span>{formatLead(blackLead)}</span>
                          {point === next.move.point && <small>Suite affichée</small>}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {previous && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    stop();
                    setSteps(previous);
                    setPrevious(steps);
                    seek(0);
                    setEnded(false);
                  }}
                >
                  Comparer avec la branche précédente
                </button>
              )}
            </>
          )}
        </>
      ) : status === 'loading' ? (
        <label className="analysis__progress">
          Chargement de KataGo
          <progress value={progress} />
        </label>
      ) : (
        <div className="study__actions">
          {engineError && <p role="status">{engineError}</p>}
          <button type="button" className="chip chip--accent" onClick={loadEngine}>
            {status === 'failed' ? 'Relancer KataGo' : 'Lancer KataGo'}
          </button>
        </div>
      )}
      <p className="reflection__source">
        Projection guidée par KataGo. À chaque coup, le réseau compare ses cinq premiers choix, avec
        le coup du kifu ou la variante choisie en supplément au départ. L’issue à long terme reste
        incertaine.
      </p>
      <button
        type="button"
        className="chip"
        onClick={() => {
          const s = useStore.getState();
          if (scene) s.showReflection(scene.after);
          else s.setMode('analyser');
        }}
      >
        {scene ? 'Revenir à la réflexion' : 'Revenir à l’analyse'}
      </button>
    </section>
  );
}
