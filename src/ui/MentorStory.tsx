import type { Mentor } from '../story/mentors.ts';
import { formatDate, formatResult } from '../story/format.ts';
import { useStore } from '../state/store.ts';
import { MentorBiography } from './MentorBiography.tsx';
import { IconPlay } from './icons.tsx';

export function MentorStory({ mentor }: { mentor: Mentor }) {
  const current = useStore((s) => s.gameIndex);
  const selectGame = useStore((s) => s.selectGame);
  const setMode = useStore((s) => s.setMode);
  return (
    <article className="mentor-story" aria-labelledby="mentor-title">
      <h2 className="chapter__title" id="mentor-title">
        Parcours de {mentor.name}
      </h2>
      <h3 className="chapter__sub">Parties importées</h3>
      <ol className="mentor-story__games">
        {mentor.games.map(({ game, index }) => (
          <li key={game.id}>
            <button
              type="button"
              className="row"
              aria-current={current === index ? 'true' : undefined}
              onClick={() => {
                setMode('lecture');
                selectGame(index, { play: true });
              }}
            >
              <IconPlay />
              <span className="row__main">
                <span className="row__meta">
                  {game.sessions ? (
                    formatDate(game.sessions)
                  ) : game.date ? (
                    <time dateTime={game.date}>{formatDate(game.date)}</time>
                  ) : (
                    'Date inconnue'
                  )}
                </span>
                <span className="row__opponent">
                  {game.black} — {game.white}
                </span>
                <span className="row__meta">{formatResult(game.result)}</span>
              </span>
              <span className="sr-only">Rejouer la partie</span>
            </button>
          </li>
        ))}
      </ol>
      <MentorBiography key={mentor.key} name={mentor.name} />
    </article>
  );
}
