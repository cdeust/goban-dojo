import { openingOf } from '../story/chapters.ts';
import { motion } from 'motion/react';
import type { GameRecord } from '../domain/game.ts';
import { ageLabel, formatDate, formatResult, handicapLabel, prettyName } from '../story/format.ts';
import { moveCount, useCurrentGame, useStore } from '../state/store.ts';

function Player({ game, color }: { game: GameRecord; color: 'B' | 'W' }) {
  const name = color === 'B' ? game.black : game.white;
  const rank = color === 'B' ? game.blackRank : game.whiteRank;
  const isShusaku = game.shusaku === color;
  return (
    <li className={`player${isShusaku ? ' player--shusaku' : ''}`}>
      <span className={`stone stone--${color === 'B' ? 'black' : 'white'}`} aria-hidden="true" />
      <span className="player__name">
        <span className="sr-only">{color === 'B' ? 'Noir : ' : 'Blanc : '}</span>
        {prettyName(name)}
      </span>
      {rank && <span className="player__rank">{rank}</span>}
    </li>
  );
}

/** Cartouche de la partie en cours : date, joueurs, circonstances, issue. */
export function GameCard() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const replaying = useStore((s) => s.mode === 'lecture' && !s.reflectionReplay);
  const readResignation = useStore((s) => s.readResignation);
  if (!game) return null;
  const finished = move >= moveCount(game);
  return (
    <motion.section
      key={game.id}
      className="card"
      aria-label="Partie en cours"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <p className="card__date">
        {game.date ? <time dateTime={game.date}>{formatDate(game.date)}</time> : 'Partie importée'}
        {!game.imported && <span className="card__age"> · Shūsaku a {ageLabel(game.date)}</span>}
      </p>
      {game.dateJapanese && (
        <p className="card__era">
          <span className="sr-only">Calendrier japonais : </span>
          {prettyName(game.dateJapanese)}
          {game.sessions && <span> · séances : {game.sessions}</span>}
        </p>
      )}
      <ul className="card__players">
        <Player game={game} color="B" />
        <Player game={game} color="W" />
      </ul>
      <dl className="card__facts">
        {game.event && (
          <>
            <dt>Cadre</dt>
            <dd>{game.event}</dd>
          </>
        )}
        {game.rengo && (
          <>
            <dt>Forme</dt>
            <dd>Rengo (partie en consultation)</dd>
          </>
        )}
        {handicapLabel(game) && (
          <>
            <dt>Handicap</dt>
            <dd>{handicapLabel(game)}</dd>
          </>
        )}
        {game.komi !== undefined && (
          <>
            <dt>Komi</dt>
            <dd>{game.komi.toLocaleString('fr-FR')}</dd>
          </>
        )}
        {!game.imported && openingOf(game).fuseki && (
          <>
            <dt>Ouverture</dt>
            <dd>
              <span lang="ja">秀策流</span> · ouverture de Shūsaku
            </dd>
          </>
        )}
        {game.place && (
          <>
            <dt>Lieu</dt>
            <dd>{game.place}</dd>
          </>
        )}
        {game.note && (
          <>
            <dt>Note</dt>
            <dd>{game.note}</dd>
          </>
        )}
        <dt>Issue</dt>
        <dd className={finished ? 'card__result card__result--final' : 'card__result'}>
          {formatResult(game.result)}
        </dd>
      </dl>
      {game.result.resign && replaying && moveCount(game) > 0 && (
        <button type="button" className="chip" onClick={readResignation}>
          Continuer après l’abandon
        </button>
      )}
    </motion.section>
  );
}
