import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activeRankAttempt,
  answerRankItem,
  abandonRankAttempt,
  emptyRankProgress,
  finishRankAttempt,
  gradeRule,
  nextRankForm,
  rankBandEvidence,
  rankNextBand,
  rankPassed,
  RANK_BANDS,
  PASS_COUNT,
  QUESTIONS_PER_FORM,
  startRankAttempt,
  validateRankProgress,
  type RankAnswer,
  type RankAttempt,
  type RankGrade,
  type RankItem,
  type RankProgress,
  type RankForm,
} from '../domain/rankAssessment.ts';
import {
  advancedIsMove,
  advancedTacticQuestion,
  advancedTacticSolution,
} from '../domain/advancedTactics.ts';
import { isMoveModule, schoolPosition, schoolQuestion, schoolSolution } from '../domain/school.ts';
import { decodeMoves, decodePoints, type GameRecord } from '../domain/game.ts';
import { pointToHuman } from '../domain/board.ts';
import { practiceDay } from '../domain/practice.ts';
import { RANK_FORMS } from '../story/rankCatalog.ts';
import { KifuBoard } from './KifuBoard.tsx';
import { evaluate, loadEngine, useEngine } from '../engine/client.ts';
import { judgeMoves } from '../engine/judge.ts';

function question(item: RankItem, game: GameRecord): string {
  const board = schoolPosition(game, item.exercise.before);
  if (item.kind === 'strategy')
    return `${item.exercise.color === 'B' ? 'Noir' : 'Blanc'} au trait. ${item.exercise.prompt} Choisissez votre coup sur le goban.`;
  if (item.kind === 'school') return schoolQuestion(board, item.exercise, game);
  if (item.kind === 'tactic') return advancedTacticQuestion(board, item.exercise);
  return item.exercise.question;
}
function isMove(item: RankItem) {
  return (
    item.kind === 'strategy' ||
    (item.kind === 'school' && isMoveModule(item.exercise.module)) ||
    (item.kind === 'tactic' && advancedIsMove(item.exercise.module))
  );
}
function choices(item: RankItem): { value: number | boolean; label: string }[] {
  if (item.kind === 'endgame') return item.exercise.choices;
  if (item.kind === 'school' && item.exercise.module === 'legality')
    return [
      { value: true, label: 'Légal' },
      { value: false, label: 'Interdit' },
    ];
  if (item.kind === 'school' && item.exercise.module === 'region-border')
    return [
      { value: 1, label: 'Noir uniquement' },
      { value: 2, label: 'Blanc uniquement' },
      { value: 3, label: 'Les deux couleurs' },
    ];
  if (item.kind === 'tactic' && item.exercise.module === 'two-eyes')
    return [
      { value: true, label: 'Oui' },
      { value: false, label: 'Non démontré' },
    ];
  return [];
}
function formatAnswer(item: RankItem, answer: RankAnswer): string {
  if (answer === null) return 'sans réponse';
  const choice = choices(item).find((c) => c.value === answer);
  return (
    choice?.label ??
    (typeof answer === 'number' && isMove(item) ? pointToHuman(answer) : String(answer))
  );
}
function correction(
  item: RankItem,
  game: GameRecord,
  answer: RankAnswer,
  grade: RankGrade,
): string {
  const board = schoolPosition(game, item.exercise.before);
  const historical = decodeMoves(game.moves)[item.exercise.before]!.point;
  if (item.kind === 'strategy')
    return grade.kind === 'estimate' && grade.loss !== null
      ? `KataGo estime une perte de ${grade.loss.toFixed(1)} points, comparée aux candidats du réseau, au coup historique ${pointToHuman(item.exercise.historical)} et à d’autres coups de la partie. La marge d’erreur est de 2 points ; ce jugement n’établit pas une vérité stratégique.`
      : `Le coup historique est ${pointToHuman(item.exercise.historical)}. Aucun jugement du moteur pour une réponse vide ou illégale.`;
  if (item.kind === 'tactic') return advancedTacticSolution(board, item.exercise, historical);
  if (item.kind === 'school')
    return schoolSolution(board, item.exercise, historical, answer === null ? undefined : answer);
  return item.exercise.explanation;
}

function RankQuestion({
  item,
  game,
  index,
  onAnswer,
}: {
  item: RankItem;
  game: GameRecord;
  index: number;
  onAnswer: (answer: RankAnswer) => void;
}) {
  const { exercise: ex } = item;
  const board = schoolPosition(game, ex.before);
  const moving = isMove(item);
  const [choice, setChoice] = useState<RankAnswer>(null);
  const [number, setNumber] = useState('');
  const [full, setFull] = useState(item.kind === 'strategy' || item.kind === 'endgame');
  const options = choices(item);
  const numeric = !moving && !options.length;
  const answer = numeric && number !== '' ? Number(number) : choice;
  // Do not show the historical candidate for a move question; it is the reference answer.
  const candidate = !moving && 'candidate' in ex ? ex.candidate : undefined;
  return (
    <section className="school-exercise" aria-label={`Question ${index + 1}`}>
      <div className="school-exercise__intro">
        <p className="chapter__index">
          Question {index + 1} / {QUESTIONS_PER_FORM} · Réponse définitive
        </p>
        <h2>{question(item, game)}</h2>
      </div>
      <div className="school-exercise__board">
        <KifuBoard
          game={game}
          before={ex.before}
          anchors={ex.anchors}
          candidate={candidate}
          board={board}
          resultBoard={board}
          played={[]}
          onPlay={moving ? setChoice : undefined}
          done={!moving}
          full={full}
        />
        <button className="chip" type="button" onClick={() => setFull((v) => !v)}>
          {full ? 'Vue locale' : 'Goban entier'}
        </button>
      </div>
      <div className="school-exercise__lesson">
        {options.map((option) => (
          <button
            key={String(option.value)}
            className="chip"
            type="button"
            aria-pressed={choice === option.value}
            onClick={() => setChoice(option.value)}
          >
            {option.label}
          </button>
        ))}
        {numeric && (
          <label>
            Nombre d’intersections
            <input
              type="number"
              min="0"
              max="361"
              value={number}
              onChange={(event) => setNumber(event.currentTarget.value)}
            />
          </label>
        )}
        {moving && (
          <p>
            {choice === null
              ? 'Choisissez une intersection.'
              : `Votre choix : ${formatAnswer(item, choice)}`}
          </p>
        )}
        <button
          className="chip chip--accent"
          type="button"
          disabled={
            answer === null ||
            (numeric &&
              (!Number.isSafeInteger(answer) || Number(answer) < 0 || Number(answer) > 361))
          }
          onClick={() => onAnswer(answer)}
        >
          Valider ma réponse
        </button>{' '}
        <button className="chip" type="button" onClick={() => onAnswer(null)}>
          Passer cette question
        </button>
        <p>Pas d’indice, de correction ou de modification après validation.</p>
      </div>
    </section>
  );
}

async function waitForEngine(): Promise<void> {
  loadEngine();
  if (useEngine.getState().status === 'ready') return;
  if (useEngine.getState().status === 'failed') throw new Error('Moteur indisponible.');
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useEngine.subscribe(({ status }) => {
      if (status !== 'ready' && status !== 'failed') return;
      unsubscribe();
      if (status === 'ready') resolve();
      else reject(new Error('Moteur indisponible.'));
    });
  });
}
async function gradeForm(
  form: RankForm,
  attempt: RankAttempt,
  games: readonly GameRecord[],
): Promise<RankGrade[]> {
  const grades: RankGrade[] = [];
  for (const [i, item] of form.items.entries()) {
    const game = games.find((g) => g.id === item.exercise.gameId);
    if (!game) throw new Error('Partie de référence absente.');
    const answer = attempt.answers[i]!;
    if (item.kind !== 'strategy') grades.push(gradeRule(item, game, answer));
    else {
      const ex = item.exercise;
      if (
        typeof answer !== 'number' ||
        schoolPosition(game, ex.before).play(ex.color, answer).illegal
      ) {
        grades.push({ kind: 'estimate', correct: false, loss: null });
        continue;
      }
      await waitForEngine();
      const position = {
        setupBlack: decodePoints(game.setupBlack),
        moves: decodeMoves(game.moves).slice(0, ex.before),
        next: ex.color,
        komi: game.komi,
      };
      const [judgement] = await judgeMoves(evaluate, position, [
        ...new Set([answer, ex.historical, ...ex.alternatives]),
      ]);
      if (!judgement || !Number.isFinite(judgement.loss))
        throw new Error('Estimation indisponible.');
      grades.push({ kind: 'estimate', correct: judgement.verdict === 'bon', loss: judgement.loss });
    }
  }
  return grades;
}

export function RankAssessment({
  games,
  progress,
  onChange,
  onBack,
  onReview,
}: {
  games: readonly GameRecord[];
  progress?: RankProgress;
  onChange: (next: RankProgress) => void;
  onBack: () => void;
  onReview: (module: string) => void;
}) {
  const state = progress ?? emptyRankProgress();
  const [resultId, setResultId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const grading = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const engine = useEngine((s) => s.status);
  const progressEngine = useEngine((s) => s.progress);
  const catalog = useMemo(
    () =>
      RANK_FORMS.filter((form) =>
        form.items.every((item) => games.some((g) => g.id === item.exercise.gameId)),
      ),
    [games],
  );
  const valid = useMemo(() => validateRankProgress(state, catalog, games), [state, catalog, games]);
  const active = activeRankAttempt(state);
  const current = active && catalog.find((form) => form.id === active.formId);
  const result = state.attempts.find((a) => a.formId === resultId && a.status === 'completed');
  const resultForm = result && catalog.find((form) => form.id === result.formId);
  function finish() {
    if (!active || !current || grading.current) return;
    grading.current = true;
    setBusy(true);
    setError('');
    void gradeForm(current, active, games)
      .then((grades) => {
        if (!mounted.current) return;
        const next = finishRankAttempt(state, current, practiceDay(), grades);
        if (next === state) throw new Error('Le résultat est incomplet.');
        onChange(next);
        setResultId(current.id);
      })
      .catch(() => {
        if (mounted.current)
          setError(
            'Correction indisponible. Vos réponses sont conservées : réessayez sans rejouer l’épreuve.',
          );
      })
      .finally(() => {
        grading.current = false;
        if (mounted.current) setBusy(false);
      });
  }
  if (!valid)
    return (
      <section className="school-welcome">
        <h2>Évaluation indisponible</h2>
        <p>La banque ou la sauvegarde ne correspond pas à cette version. Aucun résultat modifié.</p>
        <button className="chip" onClick={onBack} type="button">
          ← Programme
        </button>
      </section>
    );
  return (
    <div className="school-home">
      <section className="school-welcome">
        <button className="link" type="button" disabled={busy} onClick={onBack}>
          ← Programme
        </button>
        <p className="chapter__index">Épreuves sans indice · Parcours vers le dan</p>
        <h2>Évaluation de placement et de progression</h2>
        <p>
          Objectifs pédagogiques inspirés du{' '}
          <a
            href="https://www.nihonkiin.or.jp/teach/school_teach/digest/11.html"
            target="_blank"
            rel="noreferrer"
          >
            Nihon Ki-in
          </a>
          , pas des grades attribués. Le classement officiel repose notamment sur des résultats en
          compétition (
          <a
            href="https://ffg.jeudego.org/echelle/echelle_algo.php"
            target="_blank"
            rel="noreferrer"
          >
            FFG
          </a>
          ).
        </p>
        <p>
          Chaque épreuve contient huit positions historiques réservées, distinctes des cours.
          Réussissez au moins {PASS_COUNT}/{QUESTIONS_PER_FORM} sur deux épreuves distinctes
          entamées à deux dates différentes pour valider ce jalon interne. L’XP ne compte pas. Vous
          pouvez commencer à un niveau de votre choix.
        </p>
      </section>
      {current && active ? (
        active.answers.length < current.items.length ? (
          <>
            <RankQuestion
              key={`${current.id}:${active.answers.length}`}
              item={current.items[active.answers.length]!}
              game={games.find(
                (g) => g.id === current.items[active.answers.length]!.exercise.gameId,
              )!}
              index={active.answers.length}
              onAnswer={(answer) =>
                onChange(answerRankItem(state, current, active.answers.length, answer))
              }
            />
            <section className="school-welcome">
              <button
                type="button"
                className="chip"
                onClick={() => {
                  if (window.confirm('Abandonner cette épreuve ? Elle ne pourra pas être reprise.'))
                    onChange(abandonRankAttempt(state, practiceDay()));
                }}
              >
                Abandonner l’épreuve
              </button>
            </section>
          </>
        ) : (
          <section className="school-welcome">
            <h3>Huit réponses enregistrées</h3>
            <p>
              La correction est calculée maintenant. Les décisions de stratégie utilisent le moteur
              réel KataGo ; le verdict est une estimation, pas une preuve.
            </p>
            <button type="button" className="chip chip--accent" disabled={busy} onClick={finish}>
              Terminer et corriger
            </button>
            {busy && (
              <p role="status">
                {engine === 'loading'
                  ? `Chargement de KataGo ${Math.round(progressEngine * 100)} %`
                  : 'Correction en cours…'}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        )
      ) : result && resultForm ? (
        <section className="school-welcome" aria-label="Bilan de l’épreuve">
          <h3>
            {rankPassed(resultForm, result) ? 'Épreuve réussie' : 'Épreuve à consolider'} :{' '}
            {result.graded!.filter((g) => g.correct).length}/{QUESTIONS_PER_FORM}
          </h3>
          <p>
            {rankBandEvidence(catalog, state, resultForm.band).validated
              ? 'Jalon interne validé.'
              : 'Deux dates distinctes avec une réussite sont nécessaires au jalon.'}
          </p>
          <ol>
            {resultForm.items.map((item, index) => {
              const game = games.find((g) => g.id === item.exercise.gameId)!;
              const grade = result.graded![index]!;
              const answer = result.answers[index]!;
              return (
                <li key={item.exercise.id}>
                  <h4>
                    {grade.correct ? 'Réussi' : 'À revoir'} · {question(item, game)}
                  </h4>
                  <p>
                    Votre réponse : {formatAnswer(item, answer)}.{' '}
                    {correction(item, game, answer, grade)}
                  </p>
                  <p>
                    Source : {game.black} / {game.white}, {game.date}, après {item.exercise.before}{' '}
                    coups ({game.sources.join(', ')}).
                  </p>
                  {!grade.correct && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => onReview(item.exercise.module)}
                    >
                      Réviser cette compétence
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="chip chip--accent"
            onClick={() => setResultId(undefined)}
          >
            Voir mes jalons
          </button>
        </section>
      ) : (
        <>
          {RANK_BANDS.map((band) => {
            const evidence = rankBandEvidence(catalog, state, band.id);
            const form = nextRankForm(catalog, state, band.id);
            const passedToday = evidence.successfulDays.includes(practiceDay());
            return (
              <section className="school-welcome" key={band.id}>
                <h3>
                  {band.label} · {band.target}
                </h3>
                <p>
                  {evidence.validated
                    ? 'Jalon interne validé'
                    : `${evidence.passed} / 2 dates avec réussite`}{' '}
                  · {evidence.completed} épreuves corrigées.
                  {rankNextBand(catalog, state) === band.id ? ' Prochain jalon conseillé.' : ''}
                </p>
                {passedToday && !evidence.validated && (
                  <p>
                    Une réussite aujourd’hui : un autre succès ce jour ne validera pas le jalon.
                    Revenez demain pour conserver vos épreuves inédites.
                  </p>
                )}
                {form && !evidence.validated ? (
                  <button
                    type="button"
                    className="chip chip--accent"
                    onClick={() => onChange(startRankAttempt(state, form, practiceDay()))}
                  >
                    Passer l’épreuve : {band.label}
                  </button>
                ) : (
                  !evidence.validated && (
                    <p>
                      Plus de formulaires inédits disponibles à ce jalon. Révisez en attendant une
                      nouvelle banque.
                    </p>
                  )
                )}
              </section>
            );
          })}
          <section className="school-welcome">
            <h3>Historique des épreuves</h3>
            {state.attempts.length === 0 ? (
              <p>Aucune épreuve passée.</p>
            ) : (
              <ul>
                {state.attempts.map((attempt) => (
                  <li key={attempt.formId}>
                    {RANK_BANDS.find((b) => attempt.formId.startsWith(b.id))?.label} ·{' '}
                    {new Date(attempt.started * 86400000).toLocaleDateString('fr-FR', {
                      timeZone: 'UTC',
                    })}{' '}
                    ·{' '}
                    {attempt.status === 'abandoned'
                      ? 'abandonnée'
                      : `${attempt.graded?.filter((grade) => grade.correct).length ?? 0}/${QUESTIONS_PER_FORM}`}
                    {attempt.status === 'completed' && (
                      <button
                        type="button"
                        className="chip"
                        onClick={() => setResultId(attempt.formId)}
                      >
                        Voir le bilan
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p>
              Les résultats sont conservés dans votre progression d’école (en mémoire pour un
              visiteur). Ce test fonctionne côté navigateur : il n’offre ni surveillance anti-triche
              ni certificat. L’échelle devra être calibrée sur des parties classées et un
              échantillon de joueurs de niveau connu.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
