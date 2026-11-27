import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { pointFromHuman, pointToHuman, type Color } from '../domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord } from '../domain/game.ts';
import { schoolPosition } from '../domain/school.ts';
import type { SchoolGrade } from '../domain/schoolProgress.ts';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { judgeMoves, type Judgement } from '../engine/judge.ts';
import { STRATEGY_MODULES, type StrategyLesson } from '../story/strategyCourse.ts';
import { prettyName, colorName } from '../story/format.ts';
import { useStore } from '../state/store.ts';
import { KifuBoard } from './KifuBoard.tsx';

interface Row {
  point: number;
  judgement: Judgement;
}
const points = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const lead = (color: Color, j: Judgement) => j.blackLeadAfter * (color === 'B' ? 1 : -1);

/** Compare une décision stratégique, sans confondre le coup historique ou l'estimation IA avec une règle. */
export function StrategyExercise({
  game,
  ex,
  onFinish,
  onBack,
  onNext,
}: {
  game: GameRecord;
  ex: StrategyLesson;
  onFinish: (grade: SchoolGrade) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const board = useMemo(() => schoolPosition(game, ex.before), [game, ex.before]);
  const candidates = useMemo(
    () => [...new Set([ex.historical, ...ex.alternatives])].sort((a, b) => a - b),
    [ex],
  );
  const module = STRATEGY_MODULES.find((m) => m.id === ex.module)!;
  const status = useEngine((s) => s.status);
  const engineError = useEngine((s) => s.error);
  const engineProgress = useEngine((s) => s.progress);
  const [chosen, setChosen] = useState<number>();
  const [coordinate, setCoordinate] = useState('');
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const finalized = useRef(false);
  const [showKifu, setShowKifu] = useState(false);
  function choose(point: number) {
    if (chosen !== undefined || board.clone().play(ex.color, point).illegal) {
      if (chosen === undefined)
        setError('Ce coup est interdit. Choisissez une intersection légale.');
      return;
    }
    setError('');
    setChosen(point);
    loadEngine();
  }
  useEffect(() => {
    if (chosen === undefined || status !== 'ready' || finalized.current) return;
    let cancelled = false;
    const tested = [...new Set([chosen, ...candidates])];
    const position = {
      setupBlack: decodePoints(game.setupBlack),
      moves: decodeMoves(game.moves).slice(0, ex.before),
      next: ex.color,
      komi: game.komi,
    };
    void judgeMoves(evaluate, position, tested)
      .then((result) => {
        if (cancelled) return;
        const comparison = tested.map((point, i) => ({ point, judgement: result[i]! }));
        const ours = comparison.find((r) => r.point === chosen)!;
        finalized.current = true;
        setRows(
          comparison.sort((a, b) => lead(ex.color, b.judgement) - lead(ex.color, a.judgement)),
        );
        // Le verdict reste un signal de compétence, pas une preuve de jeu optimal.
        onFinish(ours.judgement.verdict === 'bon' ? 'exact' : 'assisted');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [chosen, status, attempt, game, ex, candidates, onFinish]);
  const shownMove = showKifu ? ex.historical : chosen;
  const nextBoard = board.clone();
  if (rows && shownMove !== undefined) nextBoard.play(ex.color, shownMove);
  const sourceNumber = game.sources.find((s) => /^cwi:\d{3}$/.test(s))?.slice(4);
  const selectedJudgement = rows?.find((r) => r.point === chosen)?.judgement;
  const kifuJudgement = rows?.find((r) => r.point === ex.historical)?.judgement;
  function openStudy() {
    if (chosen === undefined) return;
    const s = useStore.getState();
    const index = s.dataset?.games.findIndex((g) => g.id === game.id) ?? -1;
    if (index < 0) return;
    s.setMode('etudier');
    s.selectGame(index, { move: ex.before });
    s.showStudyLine([{ color: ex.color, point: chosen }]);
    s.setPanel(null);
    s.setSchoolOpen(false);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = pointFromHuman(coordinate);
    if (p !== null) choose(p);
    else setError('Saisissez une intersection, par exemple D4, sans I.');
  }
  return (
    <section className="school-exercise" aria-labelledby="strategy-title">
      <div className="school-exercise__intro">
        <button type="button" className="link" onClick={onBack}>
          ← Programme
        </button>
        <p className="chapter__index">
          Niveau {module.level} · {module.title}
        </p>
        <h2 id="strategy-title">{ex.prompt}</h2>
        <p>{colorName(ex.color)} au trait.</p>
      </div>
      <div className="school-exercise__board">
        <p className="school-caption">Goban entier · décision globale</p>
        <KifuBoard
          game={game}
          before={ex.before}
          anchors={ex.anchors}
          choices={!rows ? candidates : undefined}
          board={board}
          resultBoard={nextBoard}
          played={rows && shownMove !== undefined ? [{ color: ex.color, point: shownMove }] : []}
          onPlay={choose}
          done={chosen !== undefined}
          full={true}
        />
        <p className="school-caption">
          Les numéros initiaux appartiennent au kifu. Les lettres désignent des hypothèses légales,
          non une liste ordonnée de bonnes réponses.
        </p>
      </div>
      <div className="school-exercise__lesson">
        <p className="school-source">
          {prettyName(game.black)} – {prettyName(game.white)} · {game.date} · après le coup{' '}
          {ex.before}
          <br />
          Provenance : {game.sources.join(' · ')}{' '}
          {sourceNumber && (
            <a
              href={`https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/${sourceNumber}.sgf`}
              target="_blank"
              rel="noreferrer noopener"
            >
              SGF source
            </a>
          )}
        </p>
        <p className="school-note">{module.lesson}</p>
        <p>
          <strong>Votre démarche :</strong> {ex.rubric}
        </p>
        {chosen === undefined && (
          <>
            <div className="school-answer-grid">
              {candidates.map((p, i) => (
                <button type="button" className="chip" key={p} onClick={() => choose(p)}>
                  {String.fromCharCode(65 + i)} · {pointToHuman(p)}
                </button>
              ))}
            </div>
            <form className="school-coordinate" onSubmit={submit}>
              <label htmlFor="strategy-coordinate">Autre coup à comparer</label>
              <div>
                <input
                  id="strategy-coordinate"
                  maxLength={3}
                  value={coordinate}
                  onChange={(e) => setCoordinate(e.target.value)}
                />
                <button className="chip" type="submit">
                  Comparer avec KataGo
                </button>
              </div>
            </form>
          </>
        )}
        {chosen !== undefined && !rows && status !== 'failed' && !error && (
          <p role="status">
            {status === 'loading'
              ? `Chargement KataGo · ${Math.round(engineProgress * 100)} %`
              : 'Comparaison des positions à horizon identique…'}
          </p>
        )}
        {(error || status === 'failed') && (
          <div>
            <p role="alert">{error || engineError || 'Moteur indisponible.'}</p>
            {chosen !== undefined && (
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setError('');
                  loadEngine();
                  setAttempt((n) => n + 1);
                }}
              >
                Réessayer l’analyse
              </button>
            )}
          </div>
        )}
        {rows && selectedJudgement && kifuJudgement && (
          <>
            <p role="status" className="school-feedback">
              {selectedJudgement.verdict === 'bon'
                ? 'Votre coup est dans la marge d’incertitude du moteur.'
                : 'Le moteur estime que d’autres choix donnent une meilleure position.'}
            </p>
            <table className="study__lines" aria-label="Comparaison stratégique KataGo">
              <thead>
                <tr>
                  <th scope="col">Coup</th>
                  <th scope="col">Avance estimée ({colorName(ex.color)})</th>
                  <th scope="col">Écart au candidat moteur</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.point}>
                    <th scope="row">
                      {pointToHuman(row.point)} {row.point === chosen ? '· Vous' : ''}{' '}
                      {row.point === ex.historical ? '· Kifu' : ''}
                    </th>
                    <td>{points.format(lead(ex.color, row.judgement))} pt</td>
                    <td>{points.format(row.judgement.loss)} pt</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Meilleur candidat estimé parmi ceux comparés : {pointToHuman(selectedJudgement.best)}.
              Comparaison d’une seule inférence par position sœur ; marge d’erreur moyenne mesurée ≈
              2 points.{' '}
              {game.komi === undefined
                ? 'Komi non documenté, le moteur utilise 0 par convention.'
                : `Komi : ${game.komi}.`}{' '}
              Ce n’est pas une preuve de joseki ou de stratégie optimale.
            </p>
            <p>{ex.observation}</p>
            <p>
              Les autres hypothèses figurent plus tard dans ce même kifu ; les jouer ici modifie
              l’ordre historique. Elles sont comparées légalement depuis la position initiale.
            </p>
            <div className="school-answer-grid">
              <button type="button" className="chip" onClick={() => setShowKifu((v) => !v)}>
                {showKifu ? 'Voir mon coup' : 'Voir le coup historique'}
              </button>
              <button className="chip" type="button" onClick={openStudy}>
                Lire les suites au dojo
              </button>
              <button type="button" className="chip chip--accent" onClick={onNext}>
                Exercice suivant
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
