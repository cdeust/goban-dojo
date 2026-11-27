import { useEffect, useState } from 'react';
import { PASS } from '../domain/board.ts';
import {
  dueReviews,
  MASTERY,
  PRACTICE_LEVELS,
  practiceDay,
  recentDays,
} from '../domain/practice.ts';
import {
  FIRST_LESSON,
  LESSONS,
  LESSON_THEMES,
  lessonCard,
  recommendedLesson,
} from '../story/lessons.ts';
import { prettyName } from '../story/format.ts';
import { timelineOf, useStore } from '../state/store.ts';

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });

export function PracticePanel() {
  const practice = useStore((s) => s.practice);
  const saved = useStore((s) => s.practiceSaved);
  const dataset = useStore((s) => s.dataset);
  const index = useStore((s) => s.gameIndex);
  const move = useStore((s) => s.move);
  const startLesson = useStore((s) => s.startLesson);
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
  const recommended = recommendedLesson(practice, today);
  const learned = LESSONS.filter((lesson) => (lessonCard(lesson, practice)?.stage ?? 0) > 0).length;
  const dueLesson =
    card &&
    LESSONS.find((lesson) => lesson.gameId === card.gameId && lesson.before === card.before);

  return (
    <div className="panel__body practice">
      <p className="chapter__index">
        <span lang="ja">稽古</span> · Entraînement
      </p>
      <h2 className="chapter__title">Carnet du dojo</h2>
      <p className="practice__lead">
        Devinez le prochain coup d’un kifu, puis retrouvez-le de mémoire quelques jours plus tard.
      </p>

      <section className="practice__card practice__school">
        <p className="chapter__index">École de go · Cycle 1</p>
        <h3>Apprendre, pratiquer, progresser</h3>
        <p>
          Un programme de règles et tactique construit à partir des positions de parties réelles,
          avec des exercices par thème et une progression sauvegardée.
        </p>
        <button
          type="button"
          className="chip chip--accent"
          onClick={() => useStore.getState().setSchoolOpen(true)}
        >
          Entrer dans l’école
        </button>
      </section>
      <section className="practice__card">
        <p className="chapter__index">Leçon guidée · Libertés et capture</p>
        <h3>{FIRST_LESSON.title}</h3>
        <p>Un kifu de 1839, un coup à jouer. La règle d’abord, les suites du moteur ensuite.</p>
        <button
          type="button"
          className="chip chip--accent"
          onClick={() => startLesson(FIRST_LESSON.id)}
        >
          Commencer la leçon
        </button>
      </section>

      <section className="practice__card" aria-labelledby="curriculum-title">
        <h3 id="curriculum-title">Parcours personnalisé</h3>
        <p>
          {learned} / {LESSONS.length} exercices réussis sans indice au dernier rappel enregistré.
        </p>
        {recommended && (
          <div>
            <p>À travailler maintenant : {recommended.title}</p>
            <button
              className="chip chip--accent"
              type="button"
              onClick={() => startLesson(recommended.id)}
            >
              Ouvrir l’exercice recommandé
            </button>
          </div>
        )}
        {Object.entries(LESSON_THEMES).map(([theme, label]) => {
          const group = LESSONS.filter((lesson) => lesson.theme === theme);
          const validated = group.filter(
            (lesson) => (lessonCard(lesson, practice)?.stage ?? 0) > 0,
          ).length;
          return (
            <div key={theme} className="practice__theme">
              <h4>
                {label} · {validated} / {group.length}
              </h4>
              {group.map((lesson) => {
                const record = lessonCard(lesson, practice);
                const status = !record
                  ? 'Nouveau'
                  : record.stage === MASTERY
                    ? 'Palier mémoire'
                    : record.due <= today
                      ? 'À réviser'
                      : record.stage > 0
                        ? 'Réussi sans indice'
                        : 'À consolider';
                return (
                  <div key={lesson.id} className="practice__exercise">
                    <p>
                      Niveau {lesson.difficulty} · {status}
                    </p>
                    <button type="button" className="chip" onClick={() => startLesson(lesson.id)}>
                      {lesson.title}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        <p>
          Les niveaux désignent la difficulté des exercices, pas un rang officiel. Les rappels sont
          choisis selon votre historique.
        </p>
      </section>

      <section className="practice__card">
        <p className="chapter__index">Atelier libre · Adversaire IA</p>
        <h3>Jouer contre Leela Zero</h3>
        <p>
          Essayez une suite à partir de la position affichée. Leela Zero joue les réponses ; KataGo
          peut ensuite estimer vos coups.
        </p>
        <button
          type="button"
          className="chip"
          onClick={() => {
            const state = useStore.getState();
            state.setMode('explorer');
            state.setExploreOpponent(true);
            state.setView('dessus');
            state.setPanel(null);
          }}
        >
          Démarrer un entraînement IA
        </button>
      </section>

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
              onClick={() =>
                dueLesson ? startLesson(dueLesson.id) : start(card.gameId, card.before)
              }
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
