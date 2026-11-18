import { motion } from 'motion/react';
import { useMemo } from 'react';
import { unlockAudio } from '../replay/sound.ts';
import { CHAPTERS } from '../story/chapters.ts';
import { dateToTime } from '../story/format.ts';
import {
  SPEEDS,
  moveCount,
  useCurrentGame,
  useStore,
  type Mode,
  type ViewName,
} from '../state/store.ts';
import {
  IconFirst,
  IconLast,
  IconNextGame,
  IconPause,
  IconPlay,
  IconPrevGame,
  IconStepBack,
  IconStepForward,
} from './icons.tsx';

const LIFE_START = Date.UTC(1829, 0, 1);
const LIFE_END = Date.UTC(1863, 0, 1);
const fraction = (iso: string): number => (dateToTime(iso) - LIFE_START) / (LIFE_END - LIFE_START);

/** Frise de la vie de Shūsaku : huit chapitres, un trait par partie conservée. */
function LifeRibbon() {
  const games = useStore((s) => s.dataset?.games);
  const game = useCurrentGame();
  const chapterIndex = useStore((s) => s.chapterIndex);
  const setChapter = useStore((s) => s.setChapter);
  const setPanel = useStore((s) => s.setPanel);

  const ticks = useMemo(
    () => (games ?? []).map((g) => ({ id: g.id, x: fraction(g.date) })),
    [games],
  );
  const here = game ? fraction(game.date) : null;

  return (
    <nav className="ribbon" aria-label="Chapitres de la vie de Shūsaku">
      <div className="ribbon__track">
        <div className="ribbon__ticks" aria-hidden="true">
          {ticks.map((t) => (
            <i key={t.id} style={{ left: `${t.x * 100}%` }} />
          ))}
        </div>
        {here !== null && (
          <motion.span
            className="ribbon__here"
            aria-hidden="true"
            initial={false}
            animate={{ left: `${here * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        )}
        {CHAPTERS.map((c, i) => {
          const left = (Date.UTC(c.from, 0, 1) - LIFE_START) / (LIFE_END - LIFE_START);
          const width =
            (Date.UTC(c.to + 1, 0, 1) - Date.UTC(c.from, 0, 1)) / (LIFE_END - LIFE_START);
          return (
            <button
              key={c.id}
              type="button"
              className="ribbon__chapter"
              style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
              aria-current={i === chapterIndex ? 'true' : undefined}
              title={`${c.title} (${c.from === c.to ? c.from : `${c.from}–${c.to}`})`}
              onClick={() => {
                setChapter(i);
                setPanel('recit');
              }}
            >
              <span className="ribbon__kanji" lang="ja" aria-hidden="true">
                {c.kanji}
              </span>
              <span className="sr-only">
                {c.title}, {c.from === c.to ? c.from : `${c.from} à ${c.to}`}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ribbon__years" aria-hidden="true">
        <span>1829</span>
        <span>{game ? game.date.slice(0, 4) : ''}</span>
        <span>1862</span>
      </div>
    </nav>
  );
}

const VIEW_LABELS: [ViewName, string][] = [
  ['joueur', 'Joueur'],
  ['trois-quarts', 'Trois-quarts'],
  ['dessus', 'Dessus'],
];

const MODE_LABELS: [Mode, string, string][] = [
  ['lecture', 'Regarder', 'Regarder la partie se dérouler'],
  ['etudier', 'Étudier', 'Comparer les positions avant et après les coups tactiques'],
  ['deviner', 'Deviner', 'Chercher soi-même les coups de Shūsaku'],
  ['explorer', 'Explorer', 'Essayer d’autres coups à partir de cette position'],
];

const speedLabel = (s: number): string => (s === 0.5 ? '½×' : `${s}×`);

/** Commandes de lecture. */
function Transport() {
  const game = useCurrentGame();
  const games = useStore((s) => s.dataset?.games);
  const gameIndex = useStore((s) => s.gameIndex);
  const move = useStore((s) => s.move);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const view = useStore((s) => s.view);
  const showNumbers = useStore((s) => s.showNumbers);
  const sound = useStore((s) => s.sound);
  const continuous = useStore((s) => s.continuous);
  const effects = useStore((s) => s.effects);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const { step, togglePlay, setMove, setSpeed, setView, toggle, selectGame, setPlaying } =
    useStore.getState();
  if (!game || !games) return null;
  const total = moveCount(game);

  return (
    <div className="transport" role="group" aria-label="Lecture de la partie">
      <div className="transport__scrub">
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={move}
          aria-label="Coup"
          aria-valuetext={`Coup ${move} sur ${total}`}
          style={{ '--progress': `${total ? (move / total) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => {
            setPlaying(false);
            setMove(Number(e.target.value));
          }}
        />
        <output className="transport__count" aria-hidden="true">
          <b>{move}</b> / {total}
        </output>
      </div>

      <div className="transport__row">
        <div className="transport__group">
          <button
            type="button"
            className="icon-button"
            aria-label="Partie précédente"
            disabled={gameIndex === 0}
            onClick={() => selectGame(gameIndex - 1)}
          >
            <IconPrevGame />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Premier coup"
            onClick={() => step(-move)}
          >
            <IconFirst />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Coup précédent"
            onClick={() => step(-1)}
          >
            <IconStepBack />
          </button>
          <button
            type="button"
            className="icon-button icon-button--primary"
            aria-label={playing ? 'Pause' : 'Lecture'}
            onClick={() => {
              unlockAudio();
              togglePlay();
            }}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Coup suivant"
            onClick={() => step(1)}
          >
            <IconStepForward />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Dernier coup"
            onClick={() => step(total - move)}
          >
            <IconLast />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Partie suivante"
            disabled={gameIndex === games.length - 1}
            onClick={() => selectGame(gameIndex + 1)}
          >
            <IconNextGame />
          </button>
        </div>

        {/* Réglages : sur un écran étroit, une seule bande qui défile de côté. */}
        <div className="transport__settings">
          <div className="transport__group" role="group" aria-label="Mode">
            {MODE_LABELS.map(([m, label, title]) => (
              <button
                key={m}
                type="button"
                className="seg"
                aria-pressed={mode === m}
                title={title}
                onClick={() => {
                  if (m !== 'etudier' || mode !== m) setMode(m);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="transport__group" role="group" aria-label="Vitesse">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className="seg"
                aria-pressed={speed === s}
                aria-label={`Vitesse ${String(s).replace('.', ',')} coup${s > 1 ? 's' : ''} par seconde`}
                onClick={() => setSpeed(s)}
              >
                {speedLabel(s)}
              </button>
            ))}
          </div>

          <div className="transport__group" role="group" aria-label="Point de vue">
            {VIEW_LABELS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="seg"
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="transport__group" role="group" aria-label="Options">
            <button
              type="button"
              className="seg"
              aria-pressed={showNumbers}
              onClick={() => toggle('showNumbers')}
            >
              Numéros
            </button>
            <button
              type="button"
              className="seg"
              aria-pressed={sound}
              onClick={() => {
                unlockAudio();
                toggle('sound');
              }}
            >
              Son
            </button>
            <button
              type="button"
              className="seg"
              aria-pressed={effects}
              title="Marques d’attaque, de piège et de connexion ; lignes de force à l’impact"
              onClick={() => toggle('effects')}
            >
              Effets
            </button>
            <button
              type="button"
              className="seg"
              aria-pressed={continuous}
              title="Enchaîner automatiquement sur la partie suivante"
              onClick={() => toggle('continuous')}
            >
              Enchaîner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dock() {
  return (
    <footer className="dock">
      <LifeRibbon />
      <Transport />
    </footer>
  );
}
