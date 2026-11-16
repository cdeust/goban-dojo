import { AnimatePresence, motion } from 'motion/react';
import { PASS, pointToHuman } from '../domain/board.ts';
import { colorName, prettyName } from '../story/format.ts';
import {
  GUESS_POINTS,
  moveCount,
  nextColor,
  timelineOf,
  useCurrentGame,
  useStore,
} from '../state/store.ts';

/** Panneau du mode « deviner » : consigne, retour sur le dernier essai, bilan. */
function Guess() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const guess = useStore((s) => s.guess);
  const hint = useStore((s) => s.hint);
  const reveal = useStore((s) => s.reveal);
  if (!game) return null;
  const moves = timelineOf(game).moves;
  const next = moves[move];
  const finished = move >= moveCount(game);
  const mine = next?.color === game.shusaku && next.point !== PASS;
  const max = guess.asked * GUESS_POINTS[0];

  let feedback: string | null = null;
  if (guess.last?.kind === 'exact') {
    feedback =
      guess.last.points === GUESS_POINTS[0]
        ? 'Exact, du premier coup.'
        : `Exact (${guess.last.points} point${guess.last.points > 1 ? 's' : ''}).`;
  } else if (guess.last?.kind === 'miss') {
    const d = guess.last.distance;
    feedback = `Ce n’est pas là : Shūsaku a joué à ${d} intersection${d > 1 ? 's' : ''} de votre coup. La zone se resserre.`;
  } else if (guess.last?.kind === 'revealed') {
    feedback = `Shūsaku a joué ${pointToHuman(guess.last.point)}.`;
  }

  return (
    <>
      <h2 className="mode__title">Jouer comme Shūsaku</h2>
      <p className="mode__lead">
        {finished
          ? 'La partie est terminée.'
          : mine
            ? `À vous : où ${prettyName(game.shusakuName)} (${colorName(game.shusaku).toLowerCase()}) joue-t-il le coup ${move + 1} ? Cliquez sur le goban.`
            : `${prettyName(game.opponent)} répond…`}
      </p>
      <p className="mode__feedback" role="status" aria-live="polite">
        {feedback}
      </p>
      {mine && (
        <div className="mode__actions">
          <button type="button" className="chip" onClick={hint}>
            Un indice
          </button>
          <button type="button" className="chip" onClick={reveal}>
            Montrer le coup
          </button>
        </div>
      )}
      <dl className="mode__score">
        <div>
          <dt>Trouvés</dt>
          <dd>
            {guess.found} / {guess.asked}
          </dd>
        </div>
        <div>
          <dt>Du premier coup</dt>
          <dd>{guess.firstTry}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>
            {guess.points}
            {max > 0 && <span> / {max}</span>}
          </dd>
        </div>
      </dl>
      <p className="mode__note">
        3 points du premier coup, 2 après un indice, 1 après deux ; au troisième essai manqué, le
        coup est montré.
      </p>
    </>
  );
}

/** Panneau du mode « explorer » : coups ajoutés, retour à la partie. */
function Explore() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const variation = useStore((s) => s.variation);
  const notice = useStore((s) => s.notice);
  const undo = useStore((s) => s.undoVariation);
  const clear = useStore((s) => s.clearVariation);
  const color = useStore((s) => nextColor(s));
  if (!game) return null;
  const actual = timelineOf(game).moves[move];
  return (
    <>
      <h2 className="mode__title">Explorer une autre suite</h2>
      <p className="mode__lead">
        {variation.length === 0
          ? `Position après le coup ${move}. Posez un coup sur le goban : ${colorName(color)} joue.`
          : `${variation.length} coup${variation.length > 1 ? 's' : ''} hors de la partie. ${colorName(color)} joue.`}
      </p>
      {variation.length > 0 && (
        <ol className="mode__moves" start={move + 1}>
          {variation.map((m, i) => (
            <li key={`${i}:${m.point}`}>
              <span
                className={`stone stone--${m.color === 'B' ? 'black' : 'white'}`}
                aria-hidden="true"
              />
              <span className="sr-only">{colorName(m.color)} </span>
              {pointToHuman(m.point)}
            </li>
          ))}
        </ol>
      )}
      {variation.length === 0 && actual && actual.point !== PASS && (
        <p className="mode__note">
          Dans la partie, {colorName(actual.color).toLowerCase()} a joué{' '}
          {pointToHuman(actual.point)}.
        </p>
      )}
      <p className="mode__feedback" role="status" aria-live="polite">
        {notice}
      </p>
      <div className="mode__actions">
        <button type="button" className="chip" disabled={variation.length === 0} onClick={undo}>
          Reprendre un coup
        </button>
        <button type="button" className="chip" disabled={variation.length === 0} onClick={clear}>
          Revenir à la partie
        </button>
      </div>
      <p className="mode__note">
        Les règles sont appliquées (captures, ko, suicide). Les coups ne sont pas évalués : aucun
        moteur de go n’est encore intégré.
      </p>
    </>
  );
}

export function ModePanel() {
  const mode = useStore((s) => s.mode);
  return (
    <AnimatePresence mode="wait">
      {mode !== 'lecture' && (
        <motion.section
          key={mode}
          className="mode"
          aria-label={mode === 'deviner' ? 'Jouer comme Shūsaku' : 'Explorer une autre suite'}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {mode === 'deviner' ? <Guess /> : <Explore />}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
