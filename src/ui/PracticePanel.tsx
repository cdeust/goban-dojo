import { useEffect, useState } from 'react';
import { PASS } from '../domain/board.ts';
import {
  dueReviews,
  MASTERY,
  PRACTICE_LEVELS,
  practiceDay,
  recentDays,
} from '../domain/practice.ts';
import { prettyName } from '../story/format.ts';
import { timelineOf, useStore } from '../state/store.ts';

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });

export function PracticePanel() {
  const practice = useStore((s) => s.practice);
  const saved = useStore((s) => s.practiceSaved);
  const dataset = useStore((s) => s.dataset);
  const index = useStore((s) => s.gameIndex);
  const move = useStore((s) => s.move);
  const start = useStore((s) => s.startPractice);
  const [today, setToday] = useState(() => practiceDay());

  useEffect(() => {
    const refresh = () => setToday(practiceDay());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const games = new Map(dataset?.games.map((game) => [game.id, game]));
  const due = dueReviews(practice, today).filter(({ gameId, before }) => {
    const game = games.get(gameId);
    return game && before < game.moves.length / 3;
  });
  const card = due[0];
  const reviewGame = card && games.get(card.gameId);
  const game = dataset?.games[index];
  const nextMove = game ? timelineOf(game).moves[move] : undefined;
  const canStart = game && nextMove && nextMove.point !== PASS;
  const week = recentDays(practice, today);
  const level = PRACTICE_LEVELS.findLastIndex((item) => practice.xp >= item.xp);
  const milestone = PRACTICE_LEVELS[level]!;
  const goal = PRACTICE_LEVELS[level + 1];
  const retained = practice.cards.filter(({ stage }) => stage === MASTERY).length;

  return (
    <div className="panel__body practice">
      <p className="chapter__index">
        <span lang="ja">稽古</span> · Entraînement
      </p>
      <h2 className="chapter__title">Carnet du dojo</h2>
      <p className="practice__lead">
        Devinez le prochain coup d’un kifu, puis retrouvez-le de mémoire quelques jours plus tard.
      </p>

      <section className="practice__card">
        <p className="chapter__index">
          Votre parcours · Palier {level + 1} / {PRACTICE_LEVELS.length}
        </p>
        <h3>{milestone.name}</h3>
        <p>
          <strong>{practice.xp} XP</strong> · {retained} position{retained !== 1 ? 's' : ''} au
          palier mémoire
        </p>
        {goal && (
          <>
            <progress
              aria-label={`Progression vers ${goal.name}`}
              max={goal.xp - milestone.xp}
              value={practice.xp - milestone.xp}
            />
            <p>
              Encore {goal.xp - practice.xp} XP pour « {goal.name} ».
            </p>
          </>
        )}
        <p>Ce palier récompense l’entraînement, pas un classement officiel au go.</p>
      </section>

      <section className="practice__card">
        <h3>À réviser</h3>
        {card && reviewGame ? (
          <>
            <p>
              {due.length} position{due.length !== 1 ? 's' : ''} à reprendre.
            </p>
            <p>
              {prettyName(reviewGame.black)} contre {prettyName(reviewGame.white)} · Coup{' '}
              {card.before + 1}
            </p>
            <button
              type="button"
              className="chip chip--accent"
              onClick={() => start(card.gameId, card.before)}
            >
              Réviser le prochain coup
            </button>
          </>
        ) : (
          <p>Aucune révision due. Essayez une nouvelle position.</p>
        )}
        {canStart && (
          <button type="button" className="chip" onClick={() => start(game.id, move)}>
            Deviner depuis la position affichée
          </button>
        )}
        <p>
          Sans indice, l’intervalle s’allonge jusqu’à 30 jours. Avec un indice ou la réponse, le
          coup revient demain.
        </p>
      </section>

      <section className="practice__card">
        <h3>Les sept derniers jours</h3>
        <p>{week.filter(Boolean).length} / 7 jours d’entraînement</p>
        <ul className="practice__week" aria-label="Activité sur les sept derniers jours">
          {week.map((active, i) => {
            const label = weekday.format(new Date((today - 6 + i) * 86_400_000));
            return (
              <li key={i} data-active={active}>
                <span aria-hidden="true">{active ? '●' : '○'}</span> {label}
                <span className="sr-only">
                  {active ? ', entraînement effectué' : ', sans entraînement'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="practice__lead">
        Carnet enregistré dans ce navigateur, sans compte ni synchronisation.
      </p>
      {!saved && (
        <p role="alert">
          Le navigateur n’a pas enregistré ce carnet. La progression reste visible jusqu’à la
          fermeture de la page.
        </p>
      )}
    </div>
  );
}
