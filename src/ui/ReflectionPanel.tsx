import { useEffect, useRef, useState } from 'react';
import { pointToHuman } from '../domain/board.ts';
import type { GameRecord } from '../domain/game.ts';
import { colorName } from '../story/format.ts';
import { REFLECTION_SOURCE, reflectionMoves } from '../story/reflections.ts';
import { reflectionLines, reflectionsOf } from '../state/reflections.ts';
import { timelineOf, useCurrentGame, useStore } from '../state/store.ts';

function ReflectionLine({
  game,
  scene,
}: {
  game: GameRecord;
  scene: ReturnType<typeof reflectionsOf>[number];
}) {
  const play = useStore((s) => s.playReflection);
  const lines = reflectionLines(game, scene);
  const [line, setLine] = useState(scene.tactical && lines.length > 1 ? 1 : 0);
  const [step, setStep] = useState(0);
  const choice = lines[line]!;
  const moves = reflectionMoves(game, scene.after, choice);
  const current = moves[step - 1];

  function show(next: number) {
    setStep(next);
    play(line, next);
  }

  return (
    <>
      <label className="study__filter">
        Suite à examiner
        <select
          value={line}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLine(next);
            setStep(0);
            play(next, 0);
          }}
        >
          {lines.map(({ title }, i) => (
            <option key={title} value={i}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <div className="study__position reflection__position" aria-live="polite">
        <p className="study__index">{choice.variation ? 'Variante pédagogique' : 'Suite jouée'}</p>
        {current ? (
          <>
            <h3>
              {colorName(current.color)} {pointToHuman(current.point)}
            </h3>
            <p>{choice.notes[step - 1]}</p>
          </>
        ) : (
          <p>Position après le coup {scene.after}. Faites avancer la suite à votre rythme.</p>
        )}
      </div>
      <div className="study__nav" role="group" aria-label="Parcourir la suite">
        <button type="button" className="chip" disabled={step === 0} onClick={() => show(step - 1)}>
          ← Reculer
        </button>
        <button
          type="button"
          className="chip chip--accent"
          disabled={step === moves.length}
          onClick={() => show(step + 1)}
        >
          {step === 0 ? 'Jouer le premier coup' : 'Coup suivant →'}
        </button>
      </div>
    </>
  );
}

export function ReflectionPanel() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const select = useStore((s) => s.showReflection);
  const simulate = useStore((s) => s.playReflectionReplay);
  const setMode = useStore((s) => s.setMode);
  const effects = useStore((s) => s.effects);
  const toggle = useStore((s) => s.toggle);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  if (!game) return null;
  const scenes = reflectionsOf(game);
  const scene = scenes.find(({ after }) => after === move);
  if (!scene) return null;

  return (
    <section className="study reflection" aria-labelledby="reflection-title">
      <header>
        <h2 id="reflection-title" ref={title} tabIndex={-1}>
          Temps de réflexion
        </h2>
      </header>
      <label className="study__filter">
        Moment de la partie
        <select value={move} onChange={(event) => select(Number(event.target.value))}>
          {scenes.map(({ after, title }) => (
            <option key={after} value={after}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <div className="reflection__context">
        <p className="study__index">
          {scene.tactical
            ? 'Coup tactique'
            : scene.sessionBreak
              ? 'Interruption documentée'
              : 'Position commentée'}
        </p>
        <p>{scene.context}</p>
        <p className="reflection__question">{scene.question}</p>
      </div>
      {timelineOf(game).moves[move] && (
        <button type="button" className="chip chip--accent" onClick={simulate}>
          Voir les simulations
        </button>
      )}
      <button type="button" className="chip" onClick={() => setMode('analyser')}>
        Générer des variantes
      </button>
      <button type="button" className="chip" onClick={() => setMode('lire')}>
        Lire 60 coups d’avance
      </button>
      {scene.tactical && (
        <button type="button" className="chip" onClick={() => setMode('explorer')}>
          Essayer un coup sur le goban
        </button>
      )}
      <ReflectionLine key={scene.after} game={game} scene={scene} />
      <p className="reflection__source">
        Les variantes illustrent des options légales. Les pensées des joueurs ne sont pas connues.{' '}
        {!scene.tactical && (
          <a href={REFLECTION_SOURCE} target="_blank" rel="noopener noreferrer">
            Commentaire de Miyamoto Naoki
          </a>
        )}
      </p>
      <div className="study__actions">
        <button
          type="button"
          className="chip"
          aria-pressed={effects}
          onClick={() => toggle('effects')}
        >
          Effets
        </button>
        <button type="button" className="chip" onClick={() => setMode('lecture')}>
          Revenir à la partie
        </button>
      </div>
    </section>
  );
}
