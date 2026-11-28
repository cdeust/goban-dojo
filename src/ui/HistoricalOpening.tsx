import { useMemo, useState } from 'react';
import { boardAt, decodeMoves, decodePoints, type GameRecord } from '../domain/game.ts';
import { pointToHuman } from '../domain/board.ts';
import { OPENING_CASE } from '../story/openingCases.ts';
import { colorName, prettyName } from '../story/format.ts';
import { KifuBoard } from './KifuBoard.tsx';
import { OpeningCoach } from './OpeningCoach.tsx';

export function HistoricalOpening({
  games,
  onBack,
}: {
  games: readonly GameRecord[];
  onBack: () => void;
}) {
  const records = useMemo(
    () =>
      [OPENING_CASE.first, OPENING_CASE.second].map((source) => {
        const game = games.find((g) => g.id === source.gameId);
        if (!game) return;
        const moves = decodeMoves(game.moves),
          setup = decodePoints(game.setupBlack);
        return {
          game,
          moves,
          setup,
          before: source.before,
          board: boardAt(setup, moves, source.before),
          line: moves.slice(source.before, source.before + OPENING_CASE.length),
        };
      }),
    [games],
  );
  const [selected, setSelected] = useState<0 | 1>(0);
  const [step, setStep] = useState(1);
  const a = records[0],
    b = records[1];
  const ready =
    a &&
    b &&
    a.board.positionKey() === b.board.positionKey() &&
    a.line[0]?.color === b.line[0]?.color &&
    a.line.length === OPENING_CASE.length &&
    b.line.length === OPENING_CASE.length &&
    a.line[0]!.point !== b.line[0]!.point &&
    a.game.komi === b.game.komi;
  if (!ready || !a || !b)
    return (
      <section className="school-welcome">
        <button className="chip" onClick={onBack}>
          ← Programme
        </button>
        <p role="alert">Les deux sources nécessaires à cette étude ne concordent pas.</p>
      </section>
    );
  const active = selected === 0 ? a : b;
  const display = boardAt(active.setup, active.moves, active.before + step),
    played = active.line.slice(0, step);
  return (
    <section className="school-exercise" aria-labelledby="historical-opening-heading">
      <div className="school-exercise__intro">
        <button type="button" className="link" onClick={onBack}>
          ← Programme
        </button>
        <p className="chapter__index">Étude libre · Deux kifus authentiques</p>
        <h2 id="historical-opening-heading">Un même goban, deux plans d’ouverture</h2>
        <p>
          Shūsaku et Kadono ont échangé les couleurs entre deux parties de 1843. Après six coups,
          les pierres occupent exactement les mêmes intersections et Noir est au trait. Mais le
          choix de Noir est différent.
        </p>
      </div>
      <div className="school-exercise__board">
        <div className="school-answer-grid">
          {[a, b].map((record, i) => (
            <button
              className="chip"
              type="button"
              key={record.game.id}
              aria-pressed={selected === i}
              onClick={() => setSelected(i as 0 | 1)}
            >
              {prettyName(record.game.black)} · {pointToHuman(record.line[0]!.point)}
            </button>
          ))}
        </div>
        <p role="status">
          {step === 0
            ? 'Après les six premiers coups'
            : `Coup ${active.before + step} : ${colorName(played.at(-1)!.color)} ${pointToHuman(played.at(-1)!.point)}`}{' '}
          · {active.game.date}
        </p>
        <KifuBoard
          game={active.game}
          before={active.before}
          anchors={[]}
          board={active.board}
          resultBoard={display}
          played={played}
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
            Coup précédent du kifu
          </button>
          <button
            type="button"
            className="chip"
            disabled={step === OPENING_CASE.length}
            onClick={() => setStep((n) => n + 1)}
          >
            Coup suivant du kifu
          </button>
        </div>
        <p className="school-caption">
          Suite réellement jouée, numéros d’origine. Les six premiers coups ont atteint la même
          position dans un ordre différent.
        </p>
      </div>
      <div className="school-exercise__lesson">
        <h3>Deux priorités, pas une réponse imposée</h3>
        <p>
          Le 24 mai, Kadono joue P16. Le 18 juillet, Shūsaku choisit D5. Jouez les cinq coups de
          chaque kifu : quels groupes sont développés et quels secteurs restent ouverts ?
        </p>
        <p>
          Dans les deux cas Noir gagne par abandon. Cela ne permet pas d’attribuer la victoire au
          septième coup. Le komi n’est pas documenté ; pour l’estimation ci-dessous, la même
          convention zéro est utilisée.
        </p>
        <p>
          <a
            href="https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/050.sgf"
            target="_blank"
            rel="noreferrer noopener"
          >
            Kifu du 24 mai
          </a>{' '}
          ·{' '}
          <a
            href="https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/052.sgf"
            target="_blank"
            rel="noreferrer noopener"
          >
            Kifu du 18 juillet
          </a>
        </p>
        <p>
          Le Sensei peut aussi explorer les deux premiers choix depuis le préfixe commun du kifu de
          mai, même budget et règles de variante. Ces réponses sont alors simulées, pas les suites
          historiques.
        </p>
        <OpeningCoach
          game={a.game}
          before={a.before}
          color={a.line[0]!.color}
          chosen={a.line[0]!.point}
          chosenLabel="Choix de Kadono"
          alternative={b.line[0]!.point}
          alternativeLabel="Choix de Shūsaku"
          anchors={[]}
        />
      </div>
    </section>
  );
}
