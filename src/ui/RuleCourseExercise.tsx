import { useMemo, useState, type FormEvent } from 'react';
import { opposite, pointFromHuman, pointToHuman, PASS } from '../domain/board.ts';
import { decodeMoves, type GameRecord, type Move } from '../domain/game.ts';
import { schoolPosition } from '../domain/school.ts';
import {
  TACTICS_MODULES,
  ADVANCED_TACTIC_CHOICES,
  advancedIsMove,
  advancedTacticQuestion,
  advancedTacticSolution,
  judgeAdvancedTactic,
  snapbackProof,
  ladderProof,
  ladderContinuation,
  type AdvancedTacticExercise,
} from '../domain/advancedTactics.ts';
import { lifeReadingProof, lifeFinishes, certifiedEyes } from '../domain/lifeReading.ts';
import { ENDGAME_MODULES, judgeEndgame, type EndgameExercise } from '../domain/endgameCourse.ts';
import type { SchoolGrade } from '../domain/schoolProgress.ts';
import { prettyName } from '../story/format.ts';
import { useStore } from '../state/store.ts';
import { KifuBoard } from './KifuBoard.tsx';

export function RuleCourseExercise({
  ex,
  game,
  onFinish,
  onFailure,
  onBack,
  onNext,
}: {
  ex: AdvancedTacticExercise | EndgameExercise;
  game: GameRecord;
  onFinish: (grade: SchoolGrade) => void;
  onFailure: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const board = useMemo(() => schoolPosition(game, ex.before), [game, ex.before]);
  const history = decodeMoves(game.moves);
  const historical = history[ex.before]!;
  const endgame = 'input' in ex;
  const module = (endgame ? ENDGAME_MODULES : TACTICS_MODULES).find((m) => m.id === ex.module)!;
  const choices = endgame
    ? ex.choices
    : ex.module === 'two-eyes'
      ? ADVANCED_TACTIC_CHOICES['two-eyes']
      : [];
  const moving = !endgame && advancedIsMove(ex.module);
  const snapback = !endgame && ex.module === 'snapback';
  const ladder = !endgame && ex.module === 'ladder';
  const longLadder = !endgame && ex.module === 'long-ladder';
  const lifeInTwo = !endgame && ex.module === 'life-in-two';
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<SchoolGrade | null>(null);
  const [feedback, setFeedback] = useState('');
  const [line, setLine] = useState<Move[]>([]);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const [coordinate, setCoordinate] = useState('');
  const [full, setFull] = useState(
    longLadder || (endgame && ex.module !== 'yose-captures' && ex.module !== 'yose-boundary'),
  );
  const [showAfter, setShowAfter] = useState(false);
  const [chosen, setChosen] = useState<number | boolean>();
  const candidate = endgame ? ex.candidate : (ex.candidate ?? historical.point);
  function fail() {
    if (!attempted) onFailure();
    setAttempted(true);
    setFeedback('La réponse ne satisfait pas encore l’objectif. Réessayez ou demandez un indice.');
  }
  function complete(value: number | boolean, grade: SchoolGrade) {
    setChosen(value);
    setResult(grade);
    setFeedback(grade === 'exact' ? 'Réussi sans aide.' : 'Réussi après entraînement.');
    onFinish(grade);
  }
  function answer(value: number | boolean) {
    if (result) return;
    if (snapback && typeof value === 'number') {
      if (line.length === 0 && judgeAdvancedTactic(board, ex, value)) {
        const proof = snapbackProof(board, ex.color, value)!;
        setLine([
          { color: ex.color, point: value },
          { color: opposite(ex.color), point: proof.reply },
        ]);
        setCoordinate('');
        setFeedback(
          'La réponse de capture est simulée, non imposée. À vous de reprendre les pierres.',
        );
        return;
      }
      if (line.length === 2 && value === snapbackProof(board, ex.color, line[0]!.point)?.finish) {
        setLine([...line, { color: ex.color, point: value }]);
        complete(value, attempted ? 'assisted' : 'exact');
        return;
      }
      fail();
      return;
    }
    if (lifeInTwo && typeof value === 'number') {
      const target = ex.anchors[0]!;
      if (!line.length) {
        const proof = lifeReadingProof(board, ex.color, target, value);
        if (!proof) {
          fail();
          return;
        }
        setLine([
          { color: ex.color, point: value },
          { color: opposite(ex.color), point: proof.reply },
        ]);
        setCoordinate('');
        setFeedback(
          `Premier coup correct. ${proof.reply === PASS ? 'L’adversaire passe.' : `Défense en ${pointToHuman(proof.reply)}.`} Formez maintenant deux yeux sûrs.`,
        );
        return;
      }
      const defended = board.clone();
      for (const move of line) defended.play(move.color, move.point);
      if (!lifeFinishes(defended, ex.color, target).includes(value)) {
        fail();
        return;
      }
      setLine([...line, { color: ex.color, point: value }]);
      complete(line[0]!.point, attempted ? 'assisted' : 'exact');
      return;
    }
    if (longLadder && typeof value === 'number') {
      const position = board.clone();
      for (const move of line) position.play(move.color, move.point);
      const proof = ladderContinuation(
        position,
        ex.color,
        ex.anchors[0]!,
        value,
        ex.horizon! - line.length,
      );
      if (!proof) {
        fail();
        return;
      }
      const next = [...line, { color: ex.color, point: value }];
      const attack = position.play(ex.color, value);
      if (attack.captures.includes(ex.anchors[0]!)) {
        setLine(next);
        complete(next[0]!.point, attempted ? 'assisted' : 'exact');
        return;
      }
      const reply = proof[1]!;
      next.push({ color: opposite(ex.color), point: reply });
      setLine(next);
      setCoordinate('');
      setFeedback(
        `Atari correct. Défense adversaire en ${pointToHuman(reply)}. Poursuivez la capture.`,
      );
      return;
    }
    if (ladder && typeof value === 'number') {
      const proof =
        value === candidate && ex.line
          ? ex.line
          : ladderProof(board, ex.color, ex.anchors[0]!, value);
      if (!proof || proof.length < 5) {
        fail();
        return;
      }
      setLine(
        proof.map((point, index) => ({
          point,
          color: index % 2 === 0 ? ex.color : opposite(ex.color),
        })),
      );
      setReplayStep(1);
      complete(value, attempted ? 'assisted' : 'exact');
      return;
    }
    const valid = endgame ? judgeEndgame(ex, value).correct : judgeAdvancedTactic(board, ex, value);
    if (!valid) {
      fail();
      return;
    }
    if (moving && typeof value === 'number') setLine([{ color: ex.color, point: value }]);
    complete(value, attempted ? 'assisted' : 'exact');
  }
  function reveal() {
    if (result) return;
    if (snapback) {
      const first = line[0]?.point ?? candidate;
      const proof = snapbackProof(board, ex.color, first);
      if (!proof) return;
      setLine([
        { color: ex.color, point: first },
        { color: opposite(ex.color), point: proof.reply },
        { color: ex.color, point: proof.finish },
      ]);
    } else if ((ladder || longLadder || lifeInTwo) && ex.line) {
      setLine(
        ex.line.map((point, index) => ({
          point,
          color: index % 2 === 0 ? ex.color : opposite(ex.color),
        })),
      );
      setReplayStep(1);
    } else if (moving) setLine([{ color: ex.color, point: candidate }]);
    setResult('shown');
    setFeedback('Explication révélée. Cette position reviendra à réviser.');
    onFinish('shown');
  }
  const played =
    endgame && (showAfter || result)
      ? [historical]
      : replayStep === null
        ? line
        : line.slice(0, replayStep);
  const resultBoard = board.clone();
  for (const move of played) resultBoard.play(move.color, move.point);
  const recorded = played.every(
    (m, i) =>
      history[ex.before + i]?.point === m.point && history[ex.before + i]?.color === m.color,
  );
  const sourceNumber = game.sources.find((s) => /^cwi:\d{3}$/.test(s))?.slice(4);
  const explanation = !result
    ? ''
    : endgame
      ? ex.explanation
      : advancedTacticSolution(
          board,
          {
            ...ex,
            candidate: moving ? (line[0]?.point ?? candidate) : ex.candidate,
            ...((ladder || longLadder || lifeInTwo) && line.length
              ? { line: line.map((m) => m.point) }
              : {}),
          },
          historical.point,
        );
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = pointFromHuman(coordinate);
    if (p !== null) answer(p);
    else setFeedback('Coordonnée attendue, par exemple D4 (sans I).');
  }
  function study() {
    const s = useStore.getState();
    const i = s.dataset?.games.findIndex((g) => g.id === game.id) ?? -1;
    if (i < 0) return;
    s.setMode('etudier');
    s.selectGame(i, { move: ex.before });
    if (line.length) s.showStudyLine(line);
    s.setPanel(null);
    s.setSchoolOpen(false);
  }
  return (
    <section className="school-exercise" aria-labelledby="rule-course-title">
      <div className="school-exercise__intro">
        <button type="button" className="link" onClick={onBack}>
          ← Programme
        </button>
        <p className="chapter__index">
          Niveau {module.level} · {module.title}
        </p>
        <h2 id="rule-course-title">
          {snapback && line.length === 2 && !result
            ? 'Reprenez les pierres adverses.'
            : longLadder && line.length > 0 && !result
              ? 'Poursuivez la capture en escalier.'
              : lifeInTwo && line.length > 0 && !result
                ? 'Formez maintenant deux yeux sûrs.'
                : endgame
                  ? ex.question
                  : advancedTacticQuestion(board, ex)}
        </h2>
      </div>
      <div className="school-exercise__board">
        <div className="school-caption">
          <span>{full ? 'Goban entier' : 'Vue locale du vrai goban'}</span>
          <button type="button" className="chip" onClick={() => setFull((v) => !v)}>
            {full ? 'Vue locale' : 'Voir le goban entier'}
          </button>
        </div>
        <KifuBoard
          game={game}
          before={ex.before}
          anchors={ex.anchors}
          solutionPoints={
            lifeInTwo && result && played.length === line.length
              ? certifiedEyes(resultBoard, ex.anchors[0]!)
              : undefined
          }
          candidate={endgame ? ex.candidate : undefined}
          windowPoints={
            moving
              ? [candidate, ...(!endgame && ex.reply !== undefined ? [ex.reply] : [])]
              : undefined
          }
          board={board}
          resultBoard={resultBoard}
          played={played}
          onPlay={moving ? answer : undefined}
          done={!!result}
          full={full}
        />
        {longLadder && !result && (
          <p className="school-caption" aria-label="Lecture en cours">
            {Math.ceil(line.length / 2)} coups joués par vous · horizon {ex.horizon} demi-coups
          </p>
        )}
        {result && line.length > 1 && (
          <div className="school-answer-grid" aria-label="Lire la preuve numérotée">
            <button
              type="button"
              className="chip"
              disabled={(replayStep ?? line.length) === 0}
              onClick={() => setReplayStep(Math.max(0, (replayStep ?? line.length) - 1))}
            >
              Coup précédent
            </button>
            <span>
              {replayStep ?? line.length} / {line.length} coups
            </span>
            <button
              type="button"
              className="chip"
              disabled={(replayStep ?? line.length) === line.length}
              onClick={() => setReplayStep(Math.min(line.length, (replayStep ?? line.length) + 1))}
            >
              Coup suivant
            </button>
          </div>
        )}
        <p className="school-caption">
          Les numéros initiaux correspondent au kifu.{' '}
          {played.length > 0 &&
            (recorded
              ? 'Le coup affiché vient du kifu.'
              : 'Variante calculée, numérotation à partir de la position réelle.')}
        </p>
      </div>
      <div className="school-exercise__lesson">
        <p className="school-note">{module.lesson}</p>
        <p className="school-source">
          {prettyName(game.black)} – {prettyName(game.white)} · {game.date} · après le coup{' '}
          {ex.before}
          <br />
          Provenance : {game.sources.join(' · ')}{' '}
          {sourceNumber && (
            <a
              href={`https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/${sourceNumber}.sgf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              SGF source
            </a>
          )}
        </p>
        {!result && (
          <>
            {endgame && ex.module === 'yose-value' && (
              <button type="button" className="chip" onClick={() => setShowAfter((v) => !v)}>
                {showAfter ? 'Position avant le coup' : 'Position après le coup (comparer)'}
              </button>
            )}
            <div className="school-answer-grid">
              {choices.map((c) => (
                <button
                  type="button"
                  className="chip"
                  key={String(c.value)}
                  onClick={() => answer(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {moving && (
              <form className="school-coordinate" onSubmit={submit}>
                <label htmlFor="rule-coordinate">
                  Jouez sur le goban ou saisissez une coordonnée
                </label>
                <div>
                  <input
                    id="rule-coordinate"
                    maxLength={3}
                    value={coordinate}
                    onChange={(e) => setCoordinate(e.target.value)}
                  />
                  <button type="submit" className="chip">
                    Proposer
                  </button>
                </div>
              </form>
            )}
            <div className="school-answer-grid">
              <button
                type="button"
                className="chip"
                onClick={() => {
                  if (!attempted) onFailure();
                  setAttempted(true);
                  setFeedback(module.lesson);
                }}
              >
                Un indice
              </button>
              <button type="button" className="chip" onClick={reveal}>
                Voir l’explication
              </button>
            </div>
          </>
        )}
        <p role="status" className="school-feedback">
          {feedback}
        </p>
        {result && (
          <>
            <div className="school-explanation">
              <h3>Pourquoi ?</h3>
              {moving && typeof chosen === 'number' && chosen !== historical.point && (
                <p>
                  Votre coup {pointToHuman(chosen)} est une hypothèse légale, distincte du coup du
                  kifu.
                </p>
              )}
              {longLadder && result !== 'shown' && (
                <p>
                  Vous avez joué chacun des coups d’attaque jusqu’à la capture effective de la
                  chaîne.
                </p>
              )}
              {ladder && (
                <p>
                  Vous avez identifié le premier atari de cette lecture ; rejouez les réponses
                  numérotées pour suivre la preuve bornée.
                </p>
              )}
              <p>{explanation}</p>
            </div>
            <div className="school-answer-grid">
              <button className="chip chip--accent" type="button" onClick={onNext}>
                Exercice suivant
              </button>
              <button className="chip" type="button" onClick={study}>
                Étudier dans le kifu
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
