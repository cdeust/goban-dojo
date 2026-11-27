import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { PASS, opposite, pointFromHuman, pointToHuman } from '../domain/board.ts';
import { loadEngine, useEngine } from '../engine/client.ts';
import { GOOD_BELOW, scoreChange, type Judgement, type Verdict } from '../engine/judge.ts';
import { useJudgements } from '../engine/useJudgements.ts';
import { useExploreOpponent } from '../replay/useExploreOpponent.ts';
import { colorName, prettyName } from '../story/format.ts';
import {
  GUESS_POINTS,
  moveCount,
  nextColor,
  timelineOf,
  useCurrentGame,
  useStore,
} from '../state/store.ts';

function GuessCoordinate() {
  const [coordinate, setCoordinate] = useState('');
  const [error, setError] = useState('');
  return (
    <details className="guess-coordinate">
      <summary>Saisir une coordonnée</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const point = pointFromHuman(coordinate);
          if (point === null) {
            setError('Saisissez une intersection comme D4 ou Q16, sans colonne I.');
            return;
          }
          const s = useStore.getState();
          s.clickPoint(point);
          const next = useStore.getState();
          if (next.move === s.move && next.guess === s.guess) {
            setError('Cette intersection est occupée ou a déjà été essayée.');
            return;
          }
          setError('');
          setCoordinate('');
        }}
      >
        <label htmlFor="guess-coordinate">Intersection (par ex. D4)</label>
        <div>
          <input
            id="guess-coordinate"
            aria-describedby={error ? 'guess-coordinate-error' : undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={3}
            value={coordinate}
            onChange={(event) => {
              setCoordinate(event.target.value);
              setError('');
            }}
          />
          <button type="submit" className="chip">
            Proposer
          </button>
        </div>
        {error && (
          <p role="alert" id="guess-coordinate-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

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
            ? `À vous : où ${name} (${colorName(color).toLowerCase()}) joue-t-il le coup ${move + 1} ? Cliquez sur le goban ou saisissez une coordonnée.`
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
      {mine && <GuessCoordinate key={game.id + ':' + move} />}
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

const pointChange = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

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
          {status === 'failed' ? 'Réessayer l’évaluation' : 'Évaluer les coups'}
        </button>
      </div>
      <p className="mode__note">
        {status === 'failed'
          ? `Le moteur n’a pas pu démarrer (${error}).`
          : 'KataGo estime le score sur votre appareil.'}
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
  const studyOrigin = useStore((s) => s.studyOrigin);
  const canUndo = variation.length > (studyOrigin?.length ?? 0);
  const undo = useStore((s) => s.undoVariation);
  const clear = useStore((s) => s.clearVariation);
  const color = useStore((s) => nextColor(s));
  const assisted = useStore((s) => s.exploreOpponent);
  const setAssisted = useStore((s) => s.setExploreOpponent);
  const click = useStore((s) => s.clickPoint);
  const opponent = useExploreOpponent();
  const status = useEngine((s) => s.status);
  const engineReady = status === 'ready';
  const judgements = useJudgements(game, move, variation);
  const lastIndex = variation.length - 1;
  const lastMove = variation[lastIndex];
  const reply = lastMove?.playedBy === 'leela' ? lastMove : undefined;
  const turnIndex = reply ? lastIndex - 1 : lastIndex;
  const turn = variation[turnIndex];
  const human = turn?.playedBy === 'human' ? turn : undefined;
  const humanScore = judgements.explored[turnIndex];
  const lastScore = judgements.explored[lastIndex];
  useEffect(() => {
    if (assisted && human && useEngine.getState().status === 'idle') loadEngine();
  }, [assisted, human]);

  if (!game) return null;
  const actual = timelineOf(game).moves[move];
  const scoreState = judgements.error || status === 'failed' ? 'Indisponible' : 'Calcul…';
  return (
    <>
      <h2 className="mode__title" ref={title} tabIndex={-1}>
        Explorer une autre suite
      </h2>
      {studyOrigin && (
        <button
          type="button"
          className="chip"
          onClick={() => useStore.getState().setMode('etudier')}
        >
          Revenir à l’étude
        </button>
      )}
      <label className="study__filter">
        Adversaire
        <select
          value={assisted ? 'engine' : 'free'}
          onChange={(e) => setAssisted(e.currentTarget.value === 'engine')}
        >
          <option value="engine">Leela Zero</option>
          <option value="free">Jouer les deux camps</option>
        </select>
      </label>
      <p className="mode__lead" role="status">
        {opponent.finished
          ? 'Fin de cette variante.'
          : assisted && opponent.error
            ? `La réponse de Leela Zero a échoué (${opponent.error}).`
            : assisted && opponent.waiting
              ? `Leela Zero prépare sa réponse avec ${colorName(color)}…`
              : assisted
                ? `À vous de jouer avec ${colorName(color)}.${variation.length === 0 ? ' Choisissez une intersection sur le goban.' : ''}`
                : `${colorName(color)} joue. Vous placez les pierres des deux camps.`}
      </p>
      <div className="mode__actions">
        {assisted && opponent.error && (
          <button className="chip chip--accent" type="button" onClick={opponent.retry}>
            Réessayer la réponse
          </button>
        )}
        <button
          className="chip"
          type="button"
          disabled={opponent.finished || opponent.waiting || !!opponent.error}
          onClick={() => click(PASS)}
        >
          Passer
        </button>
        <button className="chip" type="button" disabled={!canUndo} onClick={undo}>
          {assisted ? 'Annuler le tour' : 'Reprendre un coup'}
        </button>
        <button className="chip" type="button" disabled={!canUndo} onClick={clear}>
          {studyOrigin ? 'Recommencer mon essai' : 'Revenir à la partie'}
        </button>
      </div>
      {notice && (
        <p className="mode__feedback" role="status">
          {notice}
        </p>
      )}
      {assisted && human && (
        <section className="exercise-score">
          <h3>Bilan en points pour {colorName(human.color)}</h3>
          <dl aria-label={'Bilan en points pour ' + colorName(human.color)}>
            <div>
              <dt>Votre coup · {pointToHuman(human.point)}</dt>
              <dd>
                {humanScore
                  ? pointChange.format(scoreChange(human.color, humanScore)) + ' pt'
                  : scoreState}
              </dd>
            </div>
            {reply && (
              <div>
                <dt>Après la réponse · {pointToHuman(reply.point)}</dt>
                <dd>
                  {humanScore && lastScore
                    ? pointChange.format(scoreChange(human.color, humanScore, lastScore)) + ' pt'
                    : scoreState}
                </dd>
              </div>
            )}
          </dl>
          <p>
            Variation du score estimé depuis la position avant votre coup. Komi du calcul{' '}
            {(game.komi ?? 0).toLocaleString('fr-FR')} pt.
          </p>
        </section>
      )}
      {engineReady && lastScore && (
        <p className="mode__lead-estimate">Après ce coup, {leadLabel(lastScore.blackLeadAfter)}.</p>
      )}
      <div className="exercise-line">
        <p className="mode__anchor">
          Position après le coup {move}
          {variation.length > 0 &&
            ` · ${variation.length} coup${variation.length > 1 ? 's' : ''} hors de la partie`}
        </p>
        {actual && (
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
                {m.playedBy && <span>{m.playedBy === 'human' ? 'Vous' : 'Leela Zero'}</span>}
                <b>{pointToHuman(m.point)}</b>
                {engineReady && <VerdictTag judgement={judgements.explored[i]} />}
              </li>
            ))}
          </ol>
        )}
      </div>
      {engineReady && judgements.error && (
        <>
          <p className="mode__feedback" role="status">
            Évaluation impossible ({judgements.error}).
          </p>
          <button className="chip" type="button" onClick={judgements.retry}>
            Réessayer l’évaluation
          </button>
        </>
      )}
      <EngineControl />
      {engineReady && (
        <p className="mode__note">
          KataGo évalue les positions en règles japonaises. Les écarts proches de deux points
          restent dans la marge d’erreur moyenne mesurée.
        </p>
      )}
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
          className={mode === 'explorer' ? 'study study--explore' : 'mode'}
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
