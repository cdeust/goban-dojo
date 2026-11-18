import { useEffect, useRef, useState } from 'react';
import { pointToHuman } from '../domain/board.ts';
import { momentFor } from '../story/chapters.ts';
import { colorName } from '../story/format.ts';
import { useCurrentGame, useStore } from '../state/store.ts';
import { studyOf } from '../state/study.ts';

const THEMES = {
  all: 'Tous les thèmes',
  captures: 'Captures',
  atari: 'Ataris',
  connects: 'Connexions',
} as const;

type Theme = keyof typeof THEMES;

const QUESTIONS: Record<Theme, string> = {
  all: 'Quel groupe peut être menacé, capturé ou relié ?',
  captures: 'Quel groupe adverse n’a plus qu’une liberté à prendre ?',
  atari: 'Quel coup peut ne laisser qu’une liberté à un groupe adverse ?',
  connects: 'Quel coup peut relier deux groupes de votre couleur ?',
};

const coordinates = (points: number[]) => points.map(pointToHuman).join(', ');

export function StudyPanel() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const target = useStore((s) => s.studyMove);
  const show = useStore((s) => s.showStudyMove);
  const [theme, setTheme] = useState<Theme>('all');
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  if (!game) return null;

  const all = studyOf(game);
  const matching = theme === 'all' ? all : all.filter((item) => item[theme].length > 0);
  const selected = matching.findIndex((item) => item.number === target);
  const upcoming = matching.findIndex((item) => item.number > move);
  const index = selected >= 0 ? selected : upcoming >= 0 ? upcoming : matching.length - 1;
  const entry = matching[index];
  const active = entry?.number === target;
  const after = active && move === target;
  const moment = after ? momentFor(game, move) : null;

  return (
    <section className="study" aria-labelledby="study-title">
      <header>
        <h2 id="study-title" ref={title} tabIndex={-1}>
          Étude du kifu
        </h2>
        <p>Repérez une idée tactique, puis rejouez le coup de la partie.</p>
      </header>

      <label className="study__filter">
        Thème
        <select
          value={theme}
          onChange={(e) => {
            const next = e.target.value as Theme;
            setTheme(next);
            const entries = next === 'all' ? all : all.filter((item) => item[next].length > 0);
            const nearest = entries.find((item) => item.number >= (target ?? move + 1));
            const candidate = nearest ?? entries.at(-1);
            show(candidate?.number ?? null);
          }}
        >
          {Object.entries(THEMES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {entry ? (
        <>
          <div className="study__position" aria-live="polite">
            <p className="study__index">
              Position {index + 1} sur {matching.length}
            </p>
            <h3>Coup {entry.number}</h3>
            {after ? (
              <>
                <p>
                  {colorName(entry.move.color)} joue en{' '}
                  <strong>{pointToHuman(entry.move.point)}</strong>.
                </p>
                <ul className="study__details">
                  {entry.captures.length > 0 && (
                    <li data-note="capture">
                      <b>Capture.</b> Retire{' '}
                      {entry.captures.length === 1 ? 'la pierre' : 'les pierres'} en{' '}
                      {coordinates(entry.captures)}. Le coup occupe la dernière liberté de chaque
                      groupe capturé.
                    </li>
                  )}
                  {entry.atari.length > 0 && (
                    <li data-note="atari">
                      <b>Atari.</b> Les pierres marquées en {coordinates(entry.atari)} appartiennent
                      à un ou plusieurs groupes qui n’ont plus qu’une liberté chacun.
                    </li>
                  )}
                  {entry.connects.length > 0 && (
                    <li data-note="connection">
                      <b>Connexion.</b> Le coup réunit des groupes jusque-là séparés, au contact des
                      pierres en {coordinates(entry.connects)}.
                    </li>
                  )}
                </ul>
                {moment && (
                  <p className="study__history">
                    <b>{moment.title}.</b> {moment.text}
                  </p>
                )}
              </>
            ) : (
              <p>
                {active
                  ? `À ${colorName(entry.move.color)} de jouer. ${QUESTIONS[theme]}`
                  : 'Placez le goban juste avant ce coup pour chercher une suite.'}
              </p>
            )}
          </div>

          <div className="study__actions">
            <button
              type="button"
              className="chip chip--accent"
              onClick={() => show(entry.number, active && !after)}
            >
              {!active
                ? 'Voir la position'
                : after
                  ? 'Revoir avant le coup'
                  : 'Jouer le coup du kifu'}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const s = useStore.getState();
                s.setMove(entry.number - 1);
                s.setMode('explorer');
              }}
            >
              Essayer une variante
            </button>
          </div>
          <nav className="study__nav" aria-label="Positions à étudier">
            <button
              type="button"
              className="chip"
              disabled={index <= 0}
              onClick={() => {
                const previous = matching[index - 1];
                if (previous) show(previous.number);
              }}
            >
              ← Précédente
            </button>
            <button
              type="button"
              className="chip"
              disabled={index >= matching.length - 1}
              onClick={() => {
                const next = matching[index + 1];
                if (next) show(next.number);
              }}
            >
              Suivante →
            </button>
          </nav>
        </>
      ) : (
        <p className="study__position" role="status">
          Aucune position pour ce thème dans cette partie.
        </p>
      )}
    </section>
  );
}
