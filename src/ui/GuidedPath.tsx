import { useMemo } from 'react';
import { coursePlan } from '../domain/schoolProgress.ts';
import { dueReviews, type Practice } from '../domain/practice.ts';
import { PASS } from '../domain/board.ts';
import { type GameRecord } from '../domain/game.ts';
import { ALL_EXERCISES, ALL_MODULES } from '../story/courseCatalog.ts';
import { LESSONS } from '../story/lessons.ts';
import { loadSchoolProgress } from '../state/schoolProgress.ts';
import { timelineOf, useStore } from '../state/store.ts';

export function GuidedPath({
  games,
  practice,
  today,
}: {
  games: readonly GameRecord[];
  practice: Practice;
  today: number;
}) {
  const catalog = useMemo(() => {
    const ids = new Set(games.map((game) => game.id));
    return ALL_EXERCISES.filter((ex) => ids.has(ex.gameId));
  }, [games]);
  const progress = loadSchoolProgress();
  const plan = coursePlan(catalog, progress, today, ALL_MODULES);
  const kifuDue = dueReviews(practice, today).filter(({ gameId, before }) => {
    const game = games.find((g) => g.id === gameId);
    const target = game && timelineOf(game).moves[before];
    return target && target.point !== PASS;
  });
  const reviews = kifuDue.length + plan.due;
  const card = kifuDue[0];
  const dueLesson =
    card &&
    LESSONS.find((lesson) => lesson.gameId === card.gameId && lesson.before === card.before);
  const module = plan.next && ALL_MODULES.find((item) => item.id === plan.next?.module);
  const start = () => {
    const store = useStore.getState();
    if (card) {
      if (dueLesson) store.startLesson(dueLesson.id);
      else store.startPractice(card.gameId, card.before);
    } else if (plan.next) store.setSchoolOpen(true, plan.next.id);
  };
  return (
    <section className="practice__card" aria-labelledby="guided-path-title">
      <p className="chapter__index">Leçons guidées · Votre carnet</p>
      <h3 id="guided-path-title">Ma prochaine séance</h3>
      <p>
        Niveau conseillé : {plan.level} / 9 ·{' '}
        {progress.records.filter((r) => catalog.some((e) => e.id === r.id)).length} /{' '}
        {catalog.length} exercices travaillés.
      </p>
      <p>
        {reviews} révision{reviews !== 1 ? 's' : ''} à reprendre : {kifuDue.length} kifu, {plan.due}{' '}
        école.
      </p>
      {card || plan.next ? (
        <>
          <p>
            {card
              ? `Révision du carnet : ${dueLesson?.title ?? `coup ${card.before + 1}`}`
              : `${plan.review ? 'Révision' : 'Nouvel exercice'} : ${module?.title}`}
          </p>
          <button type="button" className="chip chip--accent" onClick={start}>
            Reprendre mon parcours guidé
          </button>
        </>
      ) : (
        <p>
          Les révisions de ce niveau ne sont pas encore dues. L’école reste ouverte pour un
          entraînement libre.
        </p>
      )}
      <p>
        Les rappels passent avant les nouveautés. Le niveau dépend des réussites sans aide dans
        chaque compétence, pas de l’XP ni d’un rang officiel.
      </p>
    </section>
  );
}
