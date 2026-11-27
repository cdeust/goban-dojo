import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PASS, POINTS, pointFromHuman, pointToHuman, type Color } from '../domain/board.ts';
import {
  TRAINING_KOMI,
  TRAINING_VISITS,
  TRAINING_BUDGETS,
  validTrainingVisits,
  type TrainingVisits,
  areaScore,
  confirmTrainingScore,
  needsAdjudication,
  newTrainingGame,
  nextPlayer,
  resignTraining,
  toggleDeadGroup,
  trainingPosition,
  tryTrainingMove,
} from '../domain/trainingGame.ts';
import { useEngine } from '../engine/client.ts';
import { trainingFocus } from '../domain/trainingFocus.ts';
import { useZeroEngine } from '../engine/zeroClient.ts';
import {
  loadEngine,
  loadTrainingHistory,
  archiveTrainingSession,
  loadTrainingSession,
  opponentMove,
  reviewTrainingMove,
  saveTrainingSession,
} from '../state/trainingGame.ts';

const colorName = (color: Color) => (color === 'B' ? 'Noir' : 'Blanc');
const formatScore = (score: number) => score.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const MESSAGES = {
  occupied: 'Intersection occupée.',
  suicide: 'Suicide interdit.',
  ko: 'Ko interdit.',
  superko: 'Répétition de position interdite.',
  invalid: 'Intersection invalide.',
  finished: 'La partie est terminée.',
};

export function TrainingGame({
  onBack,
  onPractice,
}: {
  onBack: () => void;
  onPractice?: (module: string) => void;
}) {
  const [session, setSession] = useState(loadTrainingSession);
  const [error, setError] = useState('');
  const [visits, setVisits] = useState<TrainingVisits>(
    () => session?.game.visits ?? TRAINING_VISITS,
  );
  const [retry, setRetry] = useState(0);
  const [coordinate, setCoordinate] = useState('');
  const [replay, setReplay] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [history, setHistory] = useState(loadTrainingHistory);
  const reviewAbort = useRef(false);
  const mounted = useRef(false);
  const [saved, setSaved] = useState(true);
  const zero = useZeroEngine();
  const engine = useEngine();
  const game = session?.game;
  const adjudication = !!game && needsAdjudication(game);
  const aiTurn = !!game && !game.result && !adjudication && nextPlayer(game) !== game.human;
  const boardView = useMemo(
    () => trainingPosition(game?.moves.slice(0, replay ?? game.moves.length) ?? []),
    [game, replay],
  );
  useEffect(() => {
    if (session) {
      const activeSaved = saveTrainingSession(session);
      const historySaved = !session.game.result || archiveTrainingSession(session);
      setSaved(activeSaved && historySaved);
      if (session.game.result && historySaved) setHistory(loadTrainingHistory());
    }
  }, [session]);
  useEffect(() => {
    if (!aiTurn || !game) return;
    const controller = new AbortController();
    void opponentMove(game, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted)
          setSession((current) => (current?.game === game ? { ...current, game: next } : current));
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Leela Zero indisponible.');
      });
    return () => controller.abort();
  }, [aiTurn, game, retry]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reviewAbort.current = true;
    };
  }, []);
  function start(human: Color) {
    reviewAbort.current = true;
    setReplay(null);
    setError('');
    setSession({ game: newTrainingGame(human, new Date().toISOString(), visits), review: [] });
  }
  function play(point: number) {
    if (!session || !game || game.result || aiTurn) return;
    setError('');
    if (adjudication) {
      setSession({ ...session, game: toggleDeadGroup(game, point) });
      return;
    }
    const result = tryTrainingMove(game, point);
    if (result.error) setError(MESSAGES[result.error]);
    else setSession({ ...session, game: result.game });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const point = pointFromHuman(coordinate);
    if (point === null) {
      setError('Coordonnée attendue : D4, Q16, etc.');
      return;
    }
    play(point);
    setCoordinate('');
  }
  async function reviewNext(all = false) {
    if (!session || !game || reviewing || !game.result) return;
    const numbers = game.moves.flatMap((m, i) =>
      m.color === game.human && !session.review.some((r) => r.number === i + 1) ? [i + 1] : [],
    );
    if (!numbers.length) return;
    reviewAbort.current = false;
    setReviewing(true);
    setError('');
    try {
      for (const number of all ? numbers : numbers.slice(0, 1)) {
        if (reviewAbort.current) break;
        const review = await reviewTrainingMove(game, number);
        if (reviewAbort.current) break;
        setSession((current) =>
          current?.game === game ? { ...current, review: [...current.review, review] } : current,
        );
        setReplay(number);
      }
    } catch (e: unknown) {
      if (!reviewAbort.current) setError(e instanceof Error ? e.message : 'Analyse indisponible.');
    } finally {
      if (mounted.current) setReviewing(false);
    }
  }
  const totalMine = game?.moves.filter((m) => m.color === game.human).length ?? 0;
  const finalScore =
    game && (adjudication || game.result?.kind === 'score') ? areaScore(game) : null;
  return (
    <section className="school-home" aria-label="Partie d’entraînement">
      <header className="school-header">
        <div>
          <p className="chapter__index">
            <span lang="ja">対局</span> · Entraînement libre
          </p>
          <h2>Partie complète contre Leela Zero</h2>
        </div>
        <button className="chip" type="button" onClick={onBack}>
          Retour à l’école
        </button>
      </header>
      <p className="school-note">
        Goban 19 × 19 · règles de surface chinoises, superko positionnel · komi{' '}
        {formatScore(TRAINING_KOMI)} · {game?.visits ?? visits} visites par recherche. Aucun grade
        garanti.
      </p>
      {!game ? (
        <div className="school-welcome">
          <p>Choisis ta couleur. La partie commence sur un goban vide.</p>
          <Budget visits={visits} onChange={setVisits} />
          <button className="chip chip--accent" type="button" onClick={() => start('B')}>
            Jouer Noir
          </button>{' '}
          <button className="chip" type="button" onClick={() => start('W')}>
            Jouer Blanc
          </button>
        </div>
      ) : (
        <>
          <p role="status" className="school-feedback">
            Tu joues {colorName(game.human)} · {game.moves.length} coup
            {game.moves.length !== 1 ? 's' : ''} ·{' '}
            {game.result
              ? 'Partie terminée'
              : adjudication
                ? 'Comptage à confirmer'
                : aiTurn
                  ? 'Leela Zero réfléchit…'
                  : 'À toi de jouer'}
            {aiTurn && zero.status === 'loading'
              ? ` (chargement ${Math.round(zero.progress * 100)} %)`
              : ''}
          </p>
          {!saved && <p role="alert">Impossible de sauvegarder localement cette partie.</p>}
          <div
            className="school-board"
            role="group"
            aria-label="Goban interactif"
            style={{
              gridTemplateColumns: '1.1rem repeat(19, minmax(0, 1fr))',
            }}
          >
            <span className="school-axis" aria-hidden="true" />
            {Array.from({ length: 19 }, (_, i) => (
              <span key={i} className="school-axis" aria-hidden="true">
                {pointToHuman(i).charAt(0)}
              </span>
            ))}
            {Array.from({ length: POINTS }, (_, p) => {
              const color = boardView.board.get(p);
              const n = boardView.numbers.get(p);
              const marked = game.dead.includes(p) && replay === null;
              const disabled = !!game.result || aiTurn || (adjudication ? !color : !!color);
              return (
                <Cell key={p} row={p % 19 === 0 ? 19 - Math.floor(p / 19) : null}>
                  <button
                    type="button"
                    className="school-point"
                    tabIndex={-1}
                    aria-disabled={disabled}
                    aria-label={`${pointToHuman(p)}, ${color ? colorName(color) : 'vide'}${n ? ', coup ' + n : ''}${marked ? ', marqué mort' : ''}`}
                    onClick={() => {
                      if (!disabled) play(p);
                    }}
                  >
                    {color && (
                      <span
                        className={`school-stone school-stone--${color}`}
                        data-marked={marked}
                        style={marked ? { opacity: 0.5 } : undefined}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                </Cell>
              );
            })}
          </div>
          {!game.result && !aiTurn && (
            <form className="school-coordinate" onSubmit={submit}>
              <label>
                Coordonnée{' '}
                <input
                  value={coordinate}
                  onChange={(e) => setCoordinate(e.target.value)}
                  placeholder="D4"
                  maxLength={3}
                />
              </label>
              <button className="chip chip--accent" type="submit">
                {adjudication ? 'Marquer le groupe' : 'Jouer'}
              </button>
            </form>
          )}
          <div className="school-answer-grid">
            {!game.result && !adjudication && (
              <button className="chip" type="button" disabled={aiTurn} onClick={() => play(PASS)}>
                Passer
              </button>
            )}
            {!game.result && (
              <button
                className="chip"
                type="button"
                onClick={() => {
                  if (window.confirm('Abandonner cette partie ?')) {
                    setError('');
                    setSession({ ...session!, game: resignTraining(game) });
                  }
                }}
              >
                Abandonner
              </button>
            )}
            {aiTurn && error && (
              <button
                className="chip"
                type="button"
                onClick={() => {
                  setError('');
                  setRetry((n) => n + 1);
                }}
              >
                Relancer Leela Zero
              </button>
            )}
          </div>
          {adjudication && (
            <>
              <p>
                Deux passes consécutives. Marque les groupes morts en cliquant dessus ou en
                saisissant leur coordonnée. Le comptage est ta propre adjudication, pas celle du
                moteur. Vérifie les sekis et fins de partie avant de confirmer.
              </p>
              <button
                className="chip"
                type="button"
                onClick={() => setSession({ ...session!, game: confirmTrainingScore(game) })}
              >
                Confirmer mon adjudication
              </button>
            </>
          )}
          {finalScore && (
            <p>
              {adjudication ? 'Score provisoire' : 'Score adjudicatif'} : Noir{' '}
              {formatScore(finalScore.black)} · Blanc {formatScore(finalScore.white)}
            </p>
          )}
          {game.moves.length > 0 && (
            <details>
              <summary>Kifu des {game.moves.length} coups</summary>
              <ol>
                {game.moves.map((m, i) => (
                  <li key={i}>
                    {colorName(m.color)} · {pointToHuman(m.point)}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {game.result && (
            <>
              <h2>Résultat</h2>
              <p>
                {game.result.winner === 'jigo'
                  ? 'Égalité'
                  : colorName(game.result.winner) + ' gagnant'}
                {game.result.kind === 'resign' ? ' par abandon' : ' selon ton adjudication'}
              </p>
              <h2>Revue KataGo</h2>
              <p>
                Compare chaque coup joué aux cinq préférences légales du réseau. Les pertes en
                points sont des estimations, non un jugement absolu ; aucune recherche arborescente.
                Le réseau estime le score selon les règles japonaises, distinctes du comptage
                chinois de cette partie.
              </p>
              <p>
                {session!.review.length} / {totalMine} de tes coups analysés.
              </p>
              {session!.review.length < totalMine && (
                <>
                  {engine.status !== 'ready' ? (
                    <button
                      className="chip"
                      type="button"
                      disabled={engine.status === 'loading'}
                      onClick={loadEngine}
                    >
                      {engine.status === 'loading' ? 'Chargement de KataGo…' : 'Charger KataGo'}
                    </button>
                  ) : (
                    <>
                      <button
                        className="chip"
                        type="button"
                        disabled={reviewing}
                        onClick={() => void reviewNext()}
                      >
                        {reviewing ? 'Analyse…' : 'Analyser le prochain coup'}
                      </button>
                      <button
                        className="chip"
                        type="button"
                        disabled={reviewing}
                        onClick={() => void reviewNext(true)}
                      >
                        Analyser tous mes coups
                      </button>
                      {reviewing && (
                        <button
                          className="chip"
                          type="button"
                          onClick={() => {
                            reviewAbort.current = true;
                          }}
                        >
                          Arrêter après l’inférence en cours
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {engine.status === 'failed' && (
                <p role="alert">{engine.error ?? 'Échec du chargement de KataGo.'}</p>
              )}
              <label>
                Rejouer au coup{' '}
                <input
                  type="number"
                  min="0"
                  max={game.moves.length}
                  value={replay ?? game.moves.length}
                  onChange={(e) =>
                    setReplay(Math.max(0, Math.min(game.moves.length, Number(e.target.value))))
                  }
                />
              </label>
              <button className="chip" type="button" onClick={() => setReplay(null)}>
                Position finale
              </button>
              <ul>
                {[...session!.review]
                  .sort((a, b) => b.judgement.loss - a.judgement.loss)
                  .map((r) => (
                    <li key={r.number}>
                      <button className="chip" type="button" onClick={() => setReplay(r.number)}>
                        {r.number}. {pointToHuman(game.moves[r.number - 1]!.point)}
                      </button>{' '}
                      : {r.judgement.verdict}, perte estimée {formatScore(r.judgement.loss)} pts.
                      Candidat préféré : {pointToHuman(r.judgement.best)}.{' '}
                      <button
                        className="chip"
                        type="button"
                        onClick={() => setReplay(r.number - 1)}
                      >
                        Voir avant
                      </button>
                      {onPractice &&
                        (() => {
                          const focus = trainingFocus(game, r.number, r.judgement.best);
                          return (
                            focus && (
                              <p className="school-note">
                                {focus.reason}{' '}
                                <button
                                  className="chip"
                                  type="button"
                                  onClick={() => onPractice(focus.module)}
                                >
                                  Travailler ce thème
                                </button>
                              </p>
                            )
                          );
                        })()}
                    </li>
                  ))}
              </ul>
              <Budget visits={visits} onChange={setVisits} />
              <button
                className="chip"
                type="button"
                onClick={() => {
                  if (
                    !reviewing &&
                    window.confirm(
                      'Commencer une nouvelle partie ? La précédente reste dans l’historique.',
                    )
                  )
                    start('B');
                }}
              >
                Nouvelle partie Noir
              </button>{' '}
              <button
                className="chip"
                type="button"
                onClick={() => {
                  if (
                    !reviewing &&
                    window.confirm(
                      'Commencer une nouvelle partie ? La précédente reste dans l’historique.',
                    )
                  )
                    start('W');
                }}
              >
                Nouvelle partie Blanc
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="school-save-error">
              {error}
            </p>
          )}
        </>
      )}
      {history.length > 0 && (
        <details>
          <summary>
            Historique local : {history.length} partie
            {history.length > 1 ? 's terminées' : ' terminée'}
          </summary>
          <ul>
            {history.map((entry) => (
              <li key={entry.game.createdAt}>
                <button
                  className="chip"
                  type="button"
                  disabled={reviewing || (!!game && !game.result)}
                  onClick={() => {
                    setSession(entry);
                    setReplay(null);
                    setError('');
                  }}
                >
                  {new Date(entry.game.createdAt).toLocaleString('fr-FR')} ·{' '}
                  {entry.game.moves.length} coups · {colorName(entry.game.human)} ·{' '}
                  {entry.review.length} coups analysés
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
function Budget({
  visits,
  onChange,
}: {
  visits: TrainingVisits;
  onChange: (v: TrainingVisits) => void;
}) {
  return (
    <label>
      Budget de recherche de la prochaine partie{' '}
      <select
        value={visits}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (validTrainingVisits(value)) onChange(value);
        }}
      >
        {TRAINING_BUDGETS.map((v) => (
          <option key={v} value={v}>
            {v} visites
          </option>
        ))}
      </select>
      <span className="school-note">
        {' '}
        Plus de visites signifie davantage de calcul, pas un grade certifié.
      </span>
    </label>
  );
}
function Cell({ row, children }: { row: number | null; children: React.ReactNode }) {
  return (
    <>
      {row !== null && (
        <span className="school-axis" aria-hidden="true">
          {row}
        </span>
      )}
      {children}
    </>
  );
}
