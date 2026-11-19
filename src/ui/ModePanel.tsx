import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { PASS, opposite, pointToHuman } from '../domain/board.ts';
import { loadEngine, useEngine } from '../engine/client.ts';
import { GOOD_BELOW, type Judgement, type Verdict } from '../engine/judge.ts';
import { useJudgements } from '../engine/useJudgements.ts';
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
  const color = useStore((s) => s.guessColor);
  const chooseColor = useStore((s) => s.chooseGuessColor);
  if (!game) return null;
  const moves = timelineOf(game).moves;
  const next = moves[move];
  const finished = move >= moveCount(game);
  const player = (side: 'B' | 'W') => prettyName(side === 'B' ? game.black : game.white);
  const name = color === game.shusaku ? 'Shūsaku' : player(color);
  const mine = next?.color === color && next.point !== PASS;
  const max = guess.asked * GUESS_POINTS[0];

  let feedback: string | null = null;
  if (guess.last?.kind === 'exact') {
    feedback =
      guess.last.points === GUESS_POINTS[0]
        ? 'Exact, du premier coup.'
        : `Exact (${guess.last.points} point${guess.last.points > 1 ? 's' : ''}).`;
  } else if (guess.last?.kind === 'miss') {
    const d = guess.last.distance;
    feedback = `Ce n’est pas là : ${name} a joué à ${d} intersection${d > 1 ? 's' : ''} de votre coup. La zone se resserre.`;
  } else if (guess.last?.kind === 'revealed') {
    feedback = `${name} a joué ${pointToHuman(guess.last.point)}.`;
  }

  return (
    <>
      <h2 className="mode__title" id="guess-title">
        Jouer comme {name}
      </h2>
      <label className="study__filter">
        Camp à deviner
        <select
          value={color}
          onChange={(event) => chooseColor(event.currentTarget.value === 'B' ? 'B' : 'W')}
        >
          <option value="B">Noir · {player('B')}</option>
          <option value="W">Blanc · {player('W')}</option>
        </select>
      </label>
      <p className="mode__lead">
        {finished
          ? 'La partie est terminée.'
          : mine
            ? `À vous : où ${name} (${colorName(color).toLowerCase()}) joue-t-il le coup ${move + 1} ? Cliquez sur le goban.`
            : `${player(opposite(color))} répond…`}
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

const VERDICT_LABEL: Record<Verdict, string> = {
  bon: 'bon coup',
  discutable: 'discutable',
  erreur: 'erreur probable',
};

/** Verdict du réseau sur un coup : catégorie, perte arrondie, et le coup qu'il préférait. */
function VerdictTag({ judgement }: { judgement: Judgement | undefined }) {
  if (!judgement) return <span className="verdict verdict--pending">calcul…</span>;
  const { verdict, loss, best, rank } = judgement;
  return (
    <span className={`verdict verdict--${verdict}`}>
      {VERDICT_LABEL[verdict]}
      {verdict !== 'bon' && ` · ≈ ${Math.round(loss)} pts`}
      {rank === 1
        ? ' · 1ᵉʳ choix du réseau'
        : loss >= GOOD_BELOW && ` · plutôt ${pointToHuman(best)}`}
    </span>
  );
}

const leadLabel = (blackLead: number): string => {
  const n = Math.round(Math.abs(blackLead));
  return n === 0
    ? 'position équilibrée'
    : `${blackLead > 0 ? 'Noir' : 'Blanc'} mène d’environ ${n} point${n > 1 ? 's' : ''}`;
};

/** Activation et état du moteur d'évaluation. */
function EngineControl() {
  const status = useEngine((s) => s.status);
  const progress = useEngine((s) => s.progress);
  const error = useEngine((s) => s.error);
  if (status === 'ready') return null;
  if (status === 'loading') {
    return (
      <p className="mode__note">
        <label>
          Chargement du réseau…{' '}
          <progress value={progress} max={1}>
            {Math.round(progress * 100)} %
          </progress>
        </label>
      </p>
    );
  }
  return (
    <>
      <div className="mode__actions">
        <button type="button" className="chip chip--accent" onClick={loadEngine}>
          Évaluer les coups
        </button>
      </div>
      <p className="mode__note">
        {status === 'failed'
          ? `Le moteur n’a pas pu démarrer (${error}).`
          : 'Charge un réseau de neurones KataGo (16 Mo) qui tourne sur votre appareil : rien n’est envoyé ailleurs.'}
      </p>
    </>
  );
}

/** Panneau du mode « explorer » : coups ajoutés, jugement du réseau, retour à la partie. */
function Explore() {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) title.current?.focus({ preventScroll: true });
  }, []);
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const variation = useStore((s) => s.variation);
  const notice = useStore((s) => s.notice);
  const undo = useStore((s) => s.undoVariation);
  const clear = useStore((s) => s.clearVariation);
  const color = useStore((s) => nextColor(s));
  const engineReady = useEngine((s) => s.status === 'ready');
  const judgements = useJudgements(game, move, variation);
  if (!game) return null;
  const actual = timelineOf(game).moves[move];
  const last = judgements.explored.at(-1);
  return (
    <>
      <h2 className="mode__title" ref={title} tabIndex={-1}>
        Explorer une autre suite
      </h2>
      <p className="mode__lead">
        {variation.length === 0
          ? `Position après le coup ${move}. Posez un coup sur le goban : ${colorName(color)} joue.`
          : `${variation.length} coup${variation.length > 1 ? 's' : ''} hors de la partie. ${colorName(color)} joue.`}
      </p>
      {actual && actual.point !== PASS && (
        <p className="mode__actual">
          Dans la partie, {colorName(actual.color).toLowerCase()} a joué{' '}
          {pointToHuman(actual.point)}
          {engineReady && (
            <>
              {' '}
              <VerdictTag judgement={judgements.actual} />
            </>
          )}
        </p>
      )}
      {variation.length > 0 && (
        <ol className="mode__moves" start={move + 1}>
          {variation.map((m, i) => (
            <li key={`${i}:${m.point}`}>
              <span
                className={`stone stone--${m.color === 'B' ? 'black' : 'white'}`}
                aria-hidden="true"
              />
              <span className="sr-only">{colorName(m.color)} </span>
              <b>{pointToHuman(m.point)}</b>
              {engineReady && <VerdictTag judgement={judgements.explored[i]} />}
            </li>
          ))}
        </ol>
      )}
      {engineReady && last && (
        <p className="mode__lead-estimate">Après ce coup : {leadLabel(last.blackLeadAfter)}.</p>
      )}
      <p className="mode__feedback" role="status" aria-live="polite">
        {notice ?? (judgements.error ? `Évaluation impossible (${judgements.error}).` : null)}
      </p>
      <div className="mode__actions">
        <button type="button" className="chip" disabled={variation.length === 0} onClick={undo}>
          Reprendre un coup
        </button>
        <button type="button" className="chip" disabled={variation.length === 0} onClick={clear}>
          Revenir à la partie
        </button>
      </div>
      <EngineControl />
      <p className="mode__note">
        {engineReady
          ? 'Jugement d’un réseau KataGo interrogé sans lecture en profondeur : son erreur moyenne est d’environ 2 points. Un « bon coup » est un coup qu’il ne sait pas distinguer du meilleur.'
          : 'Les règles sont appliquées (captures, ko, suicide).'}
      </p>
    </>
  );
}

export function ModePanel() {
  const mode = useStore((s) => s.mode);
  return (
    <AnimatePresence mode="wait">
      {(mode === 'deviner' || mode === 'explorer') && (
        <motion.section
          key={mode}
          className="mode"
          aria-labelledby={mode === 'deviner' ? 'guess-title' : undefined}
          aria-label={mode === 'explorer' ? 'Explorer une autre suite' : undefined}
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
