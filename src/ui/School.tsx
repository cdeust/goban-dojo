import { RankAssessment } from './RankAssessment.tsx';
import { RANK_FORMS } from '../story/rankCatalog.ts';
import { validateRankProgress } from '../domain/rankAssessment.ts';
import { AccountControls } from './AccountControls.tsx';
import { progressSession } from '../state/sessionProgress.ts';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { opposite, pointFromHuman, pointToHuman } from '../domain/board.ts';
import { decodeMoves, type GameRecord, type Move } from '../domain/game.ts';
import { practiceDay } from '../domain/practice.ts';
import {
  SCHOOL_MODULES,
  exerciseAnswer,
  captureProof,
  countingSolutionPoints,
  finishingCapture,
  isMoveModule,
  schoolPosition,
  schoolQuestion,
  schoolSolution,
  type SchoolAnswer,
  type SchoolExercise,
} from '../domain/school.ts';
import {
  moduleProgress,
  markSchoolFailure,
  coursePlan,
  recordSchool,
  schoolRecord,
  type SchoolProgress,
  type SchoolGrade,
} from '../domain/schoolProgress.ts';
import {
  decodeSchoolProgress,
  loadSchoolProgress,
  saveSchoolProgress,
} from '../state/schoolProgress.ts';
import { useStore } from '../state/store.ts';
import { prettyName } from '../story/format.ts';
import { KifuBoard } from './KifuBoard.tsx';
import { ALL_MODULES, ALL_EXERCISES, type CourseExercise } from '../story/courseCatalog.ts';
import { StrategyExercise } from './StrategyExercise.tsx';
import { RuleCourseExercise } from './RuleCourseExercise.tsx';
import { TrainingGame } from './TrainingGame.tsx';
import { JapaneseCountWorkshop } from './JapaneseCountWorkshop.tsx';
import { SenseiEvidence } from './SenseiEvidence.tsx';
import { HistoricalOpening } from './HistoricalOpening.tsx';

function foundation(ex: CourseExercise): ex is SchoolExercise {
  return SCHOOL_MODULES.some((m) => m.id === ex.module);
}

const LEVEL_NAMES = [
  'Les fondations',
  'Le combat local',
  'La lecture tactique',
  'Territoire et comptage local',
  'Vie et mort',
  'Tesuji et courses de libertés',
  'Fuseki et joseki',
  'Stratégie du milieu de partie',
  'Yose et décompte',
];

function Exercise({
  ex,
  game,
  onFinish,
  onFailure,
  onNext,
  onBack,
}: {
  ex: SchoolExercise;
  game: GameRecord;
  onFinish: (result: SchoolGrade) => void;
  onFailure: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const board = useMemo(() => schoolPosition(game, ex.before), [game, ex.before]);
  const sourceNumber = game.sources.find((source) => /^cwi:\d{3}$/.test(source))?.slice(4);
  const history = decodeMoves(game.moves);
  const historical = history[ex.before]!.point;
  const mod = SCHOOL_MODULES.find((m) => m.id === ex.module)!;
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<SchoolGrade | null>(null);
  const [chosen, setChosen] = useState<SchoolAnswer>();
  const [feedback, setFeedback] = useState('');
  const [full, setFull] = useState(false);
  const [coordinate, setCoordinate] = useState('');
  const [line, setLine] = useState<Move[]>([]);
  const sequence = ex.module === 'capture-sequence';
  const afterLine = board.clone();
  for (const m of line) afterLine.play(m.color, m.point);
  function defense(first: number): Move[] | null {
    const proof = captureProof(board, ex.color, ex.anchors[0]!, first);
    if (!proof) return null;
    // Montrer une réponse qui agrandit le plus le groupe menacé ; à égalité, privilégier la vraie suite.
    const historicalReply = history[ex.before + 1]?.point;
    const choice = proof.sort(
      (a, b) =>
        b.groupSize - a.groupSize ||
        Number(b.reply === historicalReply) - Number(a.reply === historicalReply),
    )[0]!;
    return [
      { color: ex.color, point: first },
      { color: opposite(ex.color), point: choice.reply },
    ];
  }
  function complete(value: SchoolAnswer, grade: SchoolGrade) {
    setResult(grade);
    setChosen(value);
    setFeedback(grade === 'exact' ? 'Réussi sans aide.' : 'Réussi après entraînement.');
    onFinish(grade);
  }
  function answer(value: SchoolAnswer) {
    if (result) return;
    if (sequence && typeof value === 'number') {
      if (line.length === 0) {
        const next = defense(value);
        if (next) {
          setLine(next);
          setCoordinate('');
          const reply = next[1]!.point;
          const recorded = value === historical && reply === history[ex.before + 1]?.point;
          setFeedback(
            `Premier coup correct. ${recorded ? 'Le kifu montre' : 'Défense simulée :'} ${pointToHuman(reply)}. Terminez la capture.`,
          );
          return;
        }
      } else if (
        line.length === 2 &&
        finishingCapture(afterLine, ex.color, ex.anchors[0]!) === value
      ) {
        setLine([...line, { color: ex.color, point: value }]);
        complete(value, attempted ? 'assisted' : 'exact');
        return;
      }
    } else if (!sequence && exerciseAnswer(board, ex, value)) {
      complete(value, attempted ? 'assisted' : 'exact');
      return;
    }
    if (!attempted) onFailure();
    setAttempted(true);
    setFeedback(
      ex.module === 'liberties'
        ? 'Recomptez les points vides qui touchent toute la chaîne. Un point partagé ne compte qu’une fois.'
        : ex.module === 'region-size'
          ? 'Repartez du point marqué. Comptez-le, puis suivez les lignes sans traverser de pierre.'
          : ex.module === 'region-border'
            ? 'Suivez le contour de toute la zone. Regardez les pierres qui la touchent, pas seulement celles près du point marqué.'
            : 'Ce choix ne répond pas à l’objectif. Observez la position et essayez à nouveau.',
    );
  }
  function reveal() {
    if (result) return;
    if (sequence) {
      const prefix = line.length === 2 ? line : defense(historical);
      if (!prefix) return;
      const next = board.clone();
      for (const m of prefix) next.play(m.color, m.point);
      const finish = finishingCapture(next, ex.color, ex.anchors[0]!);
      if (finish === null) return;
      setLine([...prefix, { color: ex.color, point: finish }]);
    }
    setResult('shown');
    setFeedback('L’explication est affichée. Cet exercice reviendra en révision.');
    onFinish('shown');
  }
  const sendPoint = (event: FormEvent) => {
    event.preventDefault();
    const point = pointFromHuman(coordinate);
    if (point === null) {
      setFeedback('Indiquez une intersection, par exemple D4 (sans colonne I).');
      return;
    }
    answer(point);
  };
  const played: Move[] = sequence
    ? line
    : result && isMoveModule(ex.module)
      ? [{ color: ex.color, point: typeof chosen === 'number' ? chosen : historical }]
      : [];
  const resultBoard = board.clone();
  for (const move of played) resultBoard.play(move.color, move.point);
  const solutionPoints = result ? countingSolutionPoints(board, ex) : [];
  const recordedLine = played.every(
    (m, i) =>
      m.color === history[ex.before + i]?.color && m.point === history[ex.before + i]?.point,
  );
  return (
    <section className="school-exercise" aria-labelledby="school-exercise-title">
      <div className="school-exercise__intro">
        <button className="link" type="button" onClick={onBack}>
          ← Programme
        </button>
        <p className="chapter__index">
          Niveau {mod.level} · {mod.title}
        </p>
        <h2 id="school-exercise-title">
          {sequence && line.length === 2 && !result
            ? 'Terminez la capture du groupe.'
            : schoolQuestion(board, ex)}
        </h2>
      </div>
      <div className="school-exercise__board">
        <div className="school-caption">
          <span>{full ? 'Goban entier' : 'Vue locale du vrai goban 19×19'}</span>
          <button type="button" className="chip" onClick={() => setFull((v) => !v)}>
            {full ? 'Vue locale' : 'Voir le goban entier'}
          </button>
        </div>
        <KifuBoard
          game={game}
          before={ex.before}
          anchors={ex.anchors}
          solutionPoints={solutionPoints}
          candidate={ex.candidate}
          board={board}
          resultBoard={resultBoard}
          played={played}
          onPlay={isMoveModule(ex.module) ? answer : undefined}
          done={!!result}
          full={full}
        />
        <p className="school-caption">
          Les numéros indiquent les coups du kifu.{' '}
          {ex.module === 'region-size' || ex.module === 'region-border'
            ? solutionPoints.length
              ? 'La zone vide est maintenant indiquée en vert.'
              : 'Le point « ? » est le point de départ de la zone vide.'
            : 'Les pierres signalées indiquent les groupes à examiner.'}
          {solutionPoints.length > 0 && ' Les points entourés en vert constituent la correction.'}
          {played.length > 0 &&
            (recordedLine
              ? ' La suite affichée est celle du kifu.'
              : ' Suite simulée, numérotée à partir de la position réelle.')}
        </p>
      </div>
      <div className="school-exercise__lesson">
        <p className="school-note">{mod.lesson}</p>
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
        {!result && (
          <>
            {(ex.module === 'liberties' || ex.module === 'region-size') && (
              <div className="school-answer-grid">
                {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                  <button className="chip" type="button" key={n} onClick={() => answer(n)}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {ex.module === 'region-border' && (
              <div className="school-answer-grid">
                {[
                  [1, 'Noir'],
                  [2, 'Blanc'],
                  [3, 'Les deux'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className="chip"
                    type="button"
                    onClick={() => answer(Number(value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {ex.module === 'legality' && (
              <div className="school-answer-grid">
                <button className="chip" type="button" onClick={() => answer(true)}>
                  Oui, légal
                </button>
                <button className="chip" type="button" onClick={() => answer(false)}>
                  Non, interdit
                </button>
              </div>
            )}
            {isMoveModule(ex.module) && (
              <form className="school-coordinate" onSubmit={sendPoint}>
                <label htmlFor="school-coordinate">
                  Jouez sur le goban ou saisissez une coordonnée
                </label>
                <div>
                  <input
                    id="school-coordinate"
                    value={coordinate}
                    maxLength={3}
                    onChange={(e) => setCoordinate(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="submit" className="chip">
                    Proposer
                  </button>
                </div>
              </form>
            )}
            <button
              type="button"
              className="chip"
              onClick={() => {
                if (!attempted) onFailure();
                setAttempted(true);
                setFeedback(mod.lesson);
              }}
            >
              Un indice
            </button>{' '}
            <button className="chip" type="button" onClick={reveal}>
              Voir l’explication
            </button>
          </>
        )}
        <p role="status" className="school-feedback">
          {feedback}
        </p>
        {result && (
          <>
            <div className="school-explanation">
              <h3>Pourquoi ?</h3>
              <p>{schoolSolution(board, ex, historical, chosen)}</p>
              <p>Ce résultat vérifie l’objectif local, pas l’optimalité globale du coup.</p>
            </div>
            <div className="school-answer-grid">
              <button className="chip chip--accent" type="button" onClick={onNext}>
                Exercice suivant
              </button>
              <button
                className="chip"
                type="button"
                onClick={() => {
                  const s = useStore.getState();
                  const index = s.dataset?.games.findIndex((g) => g.id === game.id) ?? -1;
                  if (index < 0) return;
                  s.setMode('etudier');
                  s.selectGame(index, { move: ex.before });
                  s.setPanel(null);
                  s.setSchoolOpen(false);
                }}
              >
                Étudier dans le kifu
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function School() {
  const games = useStore((s) => s.dataset?.games);
  const close = useStore((s) => s.setSchoolOpen);
  const catalog = useMemo(
    () => ALL_EXERCISES.filter((e) => games?.some((g) => g.id === e.gameId)),
    [games],
  );
  const visitor = progressSession().status === 'visitor';
  const [progress, setProgress] = useState(loadSchoolProgress);
  const [active, setActive] = useState<string | null>(
    () => useStore.getState().schoolStartExercise,
  );
  const [training, setTraining] = useState(false);
  const [assessing, setAssessing] = useState(() => useStore.getState().schoolStartAssessment);
  const [counting, setCounting] = useState(false);
  const [openingCase, setOpeningCase] = useState(false);
  const [session, setSession] = useState(0);
  const [saved, setSaved] = useState(true);
  const [restore, setRestore] = useState<SchoolProgress | null>(null);
  const [message, setMessage] = useState('');
  const scroller = useRef<HTMLElement>(null);
  const today = practiceDay();
  const plan = coursePlan(catalog, progress, today, ALL_MODULES);
  const recommendation = plan.next;
  const selected = catalog.find((e) => e.id === active);
  const source = selected && games?.find((g) => g.id === selected.gameId);
  const activeCount = catalog.filter((ex) => schoolRecord(progress, ex.id)).length;
  const firstTry = catalog.filter((ex) => schoolRecord(progress, ex.id)?.firstTry).length;
  function open(ex: CourseExercise) {
    scroller.current?.scrollTo({ top: 0 });
    setActive(ex.id);
    setSession((s) => s + 1);
  }
  function persist(next: SchoolProgress) {
    setProgress(next);
    setSaved(saveSchoolProgress(next));
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'goban-dojo-ecole.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Sauvegarde de votre progression de l’école téléchargée.');
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setRestore(null);
    try {
      const next = file.size > 1_000_000 ? null : decodeSchoolProgress(await file.text());
      if (
        !next ||
        next.records.some((r) => !catalog.some((e) => e.id === r.id)) ||
        (next.assessment && !validateRankProgress(next.assessment, RANK_FORMS, games ?? []))
      ) {
        setMessage('Fichier invalide pour ce catalogue. Votre progression n’a pas changé.');
        return;
      }
      setRestore(next);
      setMessage('');
    } catch {
      setMessage('Impossible de lire le fichier. Votre progression n’a pas changé.');
    }
  }
  function finish(result: SchoolGrade) {
    if (selected) persist(recordSchool(progress, selected.id, result, today));
  }
  function failure() {
    if (selected) persist(markSchoolFailure(progress, selected.id, today));
  }
  function back() {
    setActive(null);
    scroller.current?.scrollTo({ top: 0 });
  }
  function next() {
    const activity = coursePlan(catalog, progress, today, ALL_MODULES).next;
    if (activity) open(activity);
    else back();
  }
  return (
    <main className="school" ref={scroller}>
      <header className="school-header">
        <div>
          <p className="chapter__index">
            <span lang="ja">囲碁</span> · Goban Dojo
          </p>
          <h1>École de go</h1>
        </div>
        <div className="school-account-actions">
          <button className="chip" type="button" onClick={() => close(false)}>
            Retour au dojo
          </button>
          <AccountControls />
        </div>
      </header>
      {assessing ? (
        <RankAssessment
          games={games ?? []}
          progress={progress.assessment}
          onChange={(assessment) => persist({ ...progress, assessment })}
          onBack={() => {
            setAssessing(false);
            scroller.current?.scrollTo({ top: 0 });
          }}
          onReview={(module) => {
            const items = catalog.filter((item) => item.module === module);
            const activity =
              items.find((item) => {
                const record = schoolRecord(progress, item.id);
                return record && record.due <= today;
              }) ??
              items.find((item) => !schoolRecord(progress, item.id)) ??
              items[0];
            if (activity) {
              setAssessing(false);
              open(activity);
            }
          }}
        />
      ) : openingCase ? (
        <HistoricalOpening
          games={games ?? []}
          onBack={() => {
            setOpeningCase(false);
            scroller.current?.scrollTo({ top: 0 });
          }}
        />
      ) : counting ? (
        <JapaneseCountWorkshop
          games={games ?? []}
          onBack={() => {
            setCounting(false);
            scroller.current?.scrollTo({ top: 0 });
          }}
        />
      ) : training ? (
        <TrainingGame
          onPractice={(module) => {
            const activities = catalog.filter((e) => e.module === module);
            const activity =
              activities.find((e) => {
                const r = schoolRecord(progress, e.id);
                return r && r.due <= today;
              }) ??
              activities.find((e) => !schoolRecord(progress, e.id)) ??
              activities[0];
            if (activity) {
              setTraining(false);
              open(activity);
            }
          }}
          onBack={() => {
            setTraining(false);
            scroller.current?.scrollTo({ top: 0 });
          }}
        />
      ) : selected && source ? (
        foundation(selected) ? (
          <Exercise
            key={`${selected.id}:${session}`}
            game={source}
            ex={selected}
            onFinish={finish}
            onFailure={failure}
            onBack={back}
            onNext={next}
          />
        ) : 'historical' in selected ? (
          <StrategyExercise
            key={`${selected.id}:${session}`}
            game={source}
            ex={selected}
            onFinish={finish}
            onBack={back}
            onNext={next}
          />
        ) : (
          <RuleCourseExercise
            key={`${selected.id}:${session}`}
            game={source}
            ex={selected}
            onFinish={finish}
            onFailure={failure}
            onBack={back}
            onNext={next}
          />
        )
      ) : (
        <div className="school-home">
          <section className="school-welcome">
            <p className="chapter__index">Programme du dojo · 9 niveaux</p>
            <h2>Apprendre sur des parties réelles</h2>
            <p>
              {catalog.length} exercices tirés de {new Set(catalog.map((e) => e.gameId)).size}{' '}
              parties historiques. Règles, vie et mort, tesuji, stratégie, yose et décompte. Les
              objectifs locaux sont prouvés ; les décisions stratégiques sont comparées avec KataGo.
            </p>
            <p>
              <strong>
                {activeCount} / {catalog.length}
              </strong>{' '}
              exercices travaillés · <strong>{firstTry}</strong> réussis au premier essai
            </p>
            <progress
              aria-label="Exercices travaillés"
              max={catalog.length || 1}
              value={activeCount}
            />
            <p>
              Niveau conseillé : {plan.level} / 9 · {plan.due} révision(s) due(s).
            </p>
            {recommendation && (
              <>
                <p>
                  Votre prochaine séance :{' '}
                  {ALL_MODULES.find((m) => m.id === recommendation.module)?.title}
                </p>
                <button
                  className="chip chip--accent"
                  type="button"
                  onClick={() => open(recommendation)}
                >
                  Commencer ma séance
                </button>
              </>
            )}
            {!recommendation && (
              <p>
                Les rappels de ce niveau ne sont pas encore dus. Vous pouvez travailler librement
                les chapitres ci-dessous.
              </p>
            )}
            <p className="school-note">
              Les révisions dues passent en premier ; les positions inédites travaillent les
              compétences encore fragiles. En stratégie, une réussite signifie un coup dans la marge
              d’incertitude de KataGo, pas une solution unique. Les niveaux du dojo ne sont pas des
              grades kyu ou dan.
            </p>
          </section>
          <section className="school-welcome" aria-labelledby="historical-opening-case-title">
            <p className="chapter__index">Développer son ouverture · Étude de kifu</p>
            <h2 id="historical-opening-case-title">Un même goban, deux plans d’ouverture</h2>
            <p>
              Deux vrais kifus de 1843, mêmes pierres après six coups, mais deux décisions
              différentes. Rejouez les réponses et comparez le développement des structures avec le
              Sensei.
            </p>
            <button
              className="chip chip--accent"
              type="button"
              onClick={() => {
                setOpeningCase(true);
                scroller.current?.scrollTo({ top: 0 });
              }}
            >
              Étudier les deux ouvertures
            </button>
          </section>
          <SenseiEvidence />
          <section className="school-welcome" aria-labelledby="rank-heading">
            <p className="chapter__index">Évaluation · Objectifs kyū et dan</p>
            <h2 id="rank-heading">Mes épreuves de progression</h2>
            <p>
              Mesurez vos acquis sur des positions réservées, sans indice ni résultat avant la fin.
              Les jalons de préparation sont distincts des grades officiels.
            </p>
            <button
              className="chip chip--accent"
              type="button"
              onClick={() => {
                setAssessing(true);
                scroller.current?.scrollTo({ top: 0 });
              }}
            >
              Ouvrir mes évaluations
            </button>
          </section>
          <section className="school-welcome" aria-labelledby="training-heading">
            <p className="chapter__index">Cycle d’application · Partie complète</p>
            <h2 id="training-heading">Jouer, analyser, recommencer</h2>
            <p>
              Appliquez les acquis à une véritable partie 19×19 contre Leela Zero. Reprenez votre
              partie, analysez vos décisions avec KataGo et retrouvez les coups à travailler.
            </p>
            <button
              className="chip chip--accent"
              type="button"
              onClick={() => {
                setTraining(true);
                scroller.current?.scrollTo({ top: 0 });
              }}
            >
              Jouer une partie complète
            </button>
          </section>
          <nav className="school-level-nav" aria-label="Accès aux niveaux du cursus">
            {LEVEL_NAMES.map((name, i) => (
              <button
                type="button"
                className="chip"
                key={name}
                onClick={() =>
                  document.getElementById(`niveau-${i + 1}`)?.scrollIntoView({ block: 'start' })
                }
              >
                {i + 1} · {name}
              </button>
            ))}
          </nav>
          {LEVEL_NAMES.map((name, i) => (
            <section className="school-level" key={name} id={`niveau-${i + 1}`}>
              <h2>
                <span className="school-level-marker">0{i + 1}</span> {name}
              </h2>
              {i === 8 && (
                <button
                  className="chip chip--accent"
                  type="button"
                  onClick={() => {
                    setCounting(true);
                    scroller.current?.scrollTo({ top: 0 });
                  }}
                >
                  Atelier de comptage japonais
                </button>
              )}
              <div className="school-module-grid">
                {ALL_MODULES.filter((m) => m.level === i + 1).map((m) => {
                  const stats = moduleProgress(catalog, progress, m.id, today);
                  const exercises = catalog.filter((e) => e.module === m.id);
                  const next =
                    exercises.find((e) => {
                      const r = schoolRecord(progress, e.id);
                      return r && r.due <= today;
                    }) ??
                    exercises.find((e) => !schoolRecord(progress, e.id)) ??
                    exercises[0];
                  return (
                    <article className="school-module" key={m.id}>
                      <h3>{m.title}</h3>
                      <p>{m.lesson}</p>
                      <p>
                        {stats.attempted} / {exercises.length} travaillés · {stats.firstTry} au
                        premier essai · {stats.due} à réviser
                      </p>
                      <progress
                        max={exercises.length || 1}
                        value={stats.attempted}
                        aria-label={`Progression : ${m.title}`}
                      />
                      {next && (
                        <button type="button" className="chip" onClick={() => open(next)}>
                          Travailler : {m.title}
                        </button>
                      )}
                      {(m.id === 'long-ladder' ||
                        m.id === 'life-in-two' ||
                        m.id === 'make-life') && (
                        <details className="school-problem-list">
                          <summary>
                            {m.id === 'long-ladder'
                              ? 'Choisir un problème de lecture longue'
                              : 'Choisir un problème de vie'}
                          </summary>
                          <ol>
                            {exercises.map((ex, index) => {
                              if (
                                ex.module !== 'long-ladder' &&
                                ex.module !== 'life-in-two' &&
                                ex.module !== 'make-life'
                              )
                                return null;
                              const record = schoolRecord(progress, ex.id);
                              return (
                                <li key={ex.id}>
                                  <button type="button" className="chip" onClick={() => open(ex)}>
                                    Problème {index + 1} ·{' '}
                                    {ex.horizon ?? (ex.module === 'life-in-two' ? 3 : 1)} demi-coups
                                  </button>
                                  <span>
                                    {record
                                      ? record.last === 'exact'
                                        ? 'Résolu'
                                        : 'À retravailler'
                                      : 'Non travaillé'}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          <section className="school-backup">
            <h2>Votre progression</h2>
            <p>
              {visitor
                ? 'Mode visiteur : vos résultats ne sont pas conservés après la fermeture de cette session. Connectez-vous pour sauvegarder votre progression.'
                : 'Votre progression de l’école est synchronisée avec votre compte. Vous pouvez aussi télécharger une copie.'}
            </p>
            <button type="button" className="chip" disabled={visitor} onClick={download}>
              Exporter la progression
            </button>
            <label className="school-file">
              Restaurer une sauvegarde de l’école
              <input
                type="file"
                accept="application/json,.json"
                disabled={visitor}
                onChange={importFile}
              />
            </label>
            {restore && (
              <div role="group" aria-label="Confirmer la restauration">
                <p>
                  Le fichier contient {restore.records.length} exercices. Remplacer votre
                  progression actuelle de {progress.records.length} exercices ?
                </p>
                <button
                  className="chip"
                  type="button"
                  onClick={() => {
                    persist(restore);
                    setRestore(null);
                    setMessage('Progression restaurée.');
                  }}
                >
                  Remplacer la progression
                </button>{' '}
                <button className="chip" type="button" onClick={() => setRestore(null)}>
                  Annuler
                </button>
              </div>
            )}
            <p role="status">{message}</p>
          </section>
        </div>
      )}
      {!saved && (
        <p role="alert" className="school-save-error">
          La progression n’a pas pu être enregistrée dans cette session.
        </p>
      )}
    </main>
  );
}
