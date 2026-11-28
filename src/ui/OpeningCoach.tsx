import { useEffect, useMemo, useRef, useState } from 'react';
import { pointToHuman, type Color } from '../domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type GameRecord } from '../domain/game.ts';
import { type ShapeFacts } from '../domain/openingShape.ts';
import { evaluate } from '../engine/client.ts';
import { analyzeZero } from '../engine/zeroClient.ts';
import { colorName } from '../story/format.ts';
import {
  compareOpeningLines,
  COACH_PLIES,
  COACH_VISITS,
  type CoachComparison,
} from '../state/openingCoach.ts';
import { KifuBoard } from './KifuBoard.tsx';

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const factsRows: { key: keyof ShapeFacts; title: string }[] = [
  { key: 'chains', title: 'Chaînes distinctes' },
  { key: 'atari', title: 'Chaînes en atari' },
  { key: 'twoLiberties', title: 'Chaînes à deux libertés' },
  { key: 'occupiedCorners', title: 'Coins occupés (secteurs, pas territoires)' },
];

export function OpeningCoach({
  game,
  before,
  color,
  chosen,
  chosenLabel = 'Votre choix',
  alternative,
  alternativeLabel,
  anchors,
}: {
  game: GameRecord;
  before: number;
  color: Color;
  chosen: number;
  chosenLabel?: string;
  alternative: number;
  alternativeLabel: string;
  anchors: readonly number[];
}) {
  const prefix = useMemo(
    () => ({
      setupBlack: decodePoints(game.setupBlack),
      moves: decodeMoves(game.moves).slice(0, before),
      next: color,
      komi: game.komi,
    }),
    [game, before, color],
  );
  const board = useMemo(() => boardAt(prefix.setupBlack, prefix.moves, before), [prefix, before]);
  const [result, setResult] = useState<CoachComparison>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [branch, setBranch] = useState<0 | 1>(0);
  const [step, setStep] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function start() {
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const comparison = await compareOpeningLines(
        analyzeZero,
        evaluate,
        prefix,
        [chosen, alternative],
        run.signal,
      );
      if (!run.signal.aborted) {
        setResult(comparison);
        setBranch(0);
        setStep(1);
      }
    } catch (cause) {
      if (!run.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (controller.current === run) {
        controller.current = null;
        if (!run.signal.aborted) setBusy(false);
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }
  const line = result?.lines[branch];
  const moves = line?.steps.slice(0, step).map((item) => item.move) ?? [];
  const shown = boardAt(prefix.setupBlack, [...prefix.moves, ...moves], before + moves.length);
  const current = step > 0 ? line?.steps[step - 1] : undefined;
  const ends = result?.lines.map((item) => item.steps.at(-1)!);
  const delta = result && result.lines[1].estimatedLead - result.lines[0].estimatedLead;
  const branchLabel = (i: number) => (i === 0 ? chosenLabel : alternativeLabel);
  return (
    <section className="opening-coach" aria-labelledby="opening-coach-heading">
      <p className="chapter__index">Analyse guidée · Sensei du dojo</p>
      <h3 id="opening-coach-heading">Que se passe-t-il après votre coup ?</h3>
      <p>
        Comparez deux décisions en lisant les réponses des deux camps, au lieu de mémoriser la
        meilleure intersection. Le goban vérifie chaque coup ; Leela Zero propose les suites, KataGo
        estime les positions.
      </p>
      <p>
        Deux branches de {COACH_PLIES} demi-coups maximum, {COACH_VISITS} visites par réponse. Les
        lignes sont simulées, jamais présentées comme le kifu ni comme un joseki obligatoire.
      </p>
      {!result && !busy && (
        <button type="button" className="chip chip--accent" onClick={() => void start()}>
          Comparer les suites avec le Sensei
        </button>
      )}
      {busy && (
        <>
          <p role="status">Le Sensei lit les deux variantes…</p>
          <button type="button" className="chip" onClick={cancel}>
            Annuler la lecture
          </button>
        </>
      )}
      {error && <p role="alert">Lecture indisponible : {error}</p>}
      {result && line && ends && (
        <>
          <div className="school-answer-grid">
            {result.lines.map((item, i) => (
              <button
                type="button"
                className="chip"
                aria-pressed={branch === i}
                key={item.first}
                onClick={() => {
                  setBranch(i as 0 | 1);
                  setStep(Math.min(step, item.steps.length));
                }}
              >
                {branchLabel(i)} · {pointToHuman(item.first)}
              </button>
            ))}
          </div>
          <p role="status">
            {branchLabel(branch)} ·{' '}
            {step === 0
              ? `Avant le coup ${before + 1}`
              : `Coup ${before + step} : ${colorName(current!.move.color)} ${pointToHuman(current!.move.point)}`}{' '}
            · {step}/{line.steps.length}
          </p>
          <KifuBoard
            game={game}
            before={before}
            anchors={anchors}
            board={board}
            resultBoard={shown}
            played={moves}
            done
            full={true}
          />
          <div className="school-answer-grid">
            <button
              type="button"
              className="chip"
              disabled={step === 0}
              onClick={() => setStep((n) => n - 1)}
            >
              Coup précédent de la variante
            </button>
            <button
              type="button"
              className="chip"
              disabled={step === line.steps.length}
              onClick={() => setStep((n) => n + 1)}
            >
              Coup suivant de la variante
            </button>
          </div>
          <p>
            À cet instant, {colorName(color)} : {current?.facts.atari ?? result.initial.atari}{' '}
            chaîne(s) en atari, {current?.facts.twoLiberties ?? result.initial.twoLiberties} à deux
            libertés.
            {current
              ? current.firstGroupLiberties === null
                ? ' Le premier coup est une passe ou ne subsiste plus.'
                : ` Le groupe du premier coup possède ${current.firstGroupLiberties} liberté(s).`
              : ''}
          </p>
          {current && (
            <p>
              Adversaire : {current.opponentFacts.atari} chaîne(s) en atari et{' '}
              {current.opponentFacts.twoLiberties} à deux libertés.
            </p>
          )}
          <h4>Faits vérifiés sur le goban</h4>
          <table className="study__lines" aria-label="Mesures de structure des deux variantes">
            <thead>
              <tr>
                <th scope="col">{colorName(color)}</th>
                <th scope="col">Départ</th>
                <th scope="col">
                  {chosenLabel} ({result.lines[0].steps.length})
                </th>
                <th scope="col">
                  {alternativeLabel} ({result.lines[1].steps.length})
                </th>
              </tr>
            </thead>
            <tbody>
              {factsRows.map(({ key, title }) => (
                <tr key={key}>
                  <th scope="row">{title}</th>
                  <td>{result.initial[key]}</td>
                  <td>{ends[0]!.facts[key]}</td>
                  <td>{ends[1]!.facts[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="school-note">
            Plus de libertés peut éviter l’atari immédiat. Une chaîne, des coins occupés et même
            plusieurs libertés ne prouvent ni la vie ni le territoire. Cherchez aussi les coupures
            et les réponses adverses.
          </p>
          <h4>Estimation KataGo, séparée des faits</h4>
          <p>
            {chosenLabel} : {fmt.format(result.lines[0].estimatedLead)} points · {alternativeLabel}{' '}
            : {fmt.format(result.lines[1].estimatedLead)} points pour {colorName(color)}.
          </p>
          {result.equalHorizon ? (
            <p>
              {Math.abs(delta!) < 2
                ? 'Écart dans la marge d’incertitude du moteur (environ 2 points).'
                : `La seconde suite est estimée ${fmt.format(delta!)} points par rapport à la première.`}{' '}
              Ce sont des hypothèses à horizon égal, pas une partie gagnée.
            </p>
          ) : (
            <p>Une branche s’est terminée plus tôt : l’écart des estimations n’est pas comparé.</p>
          )}
          <p className="school-note">
            Ce travail est à la demande et ne crédite pas artificiellement votre niveau ou votre XP.
          </p>
        </>
      )}
    </section>
  );
}
