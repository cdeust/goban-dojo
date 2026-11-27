import { useMemo, useState, type FormEvent } from 'react';
import { pointFromHuman } from '../domain/board.ts';
import {
  buildTimeline,
  decodeMoves,
  decodePoints,
  prisonersAt,
  type GameRecord,
} from '../domain/game.ts';
import { countJapaneseScore, type JapaneseScore } from '../domain/endgameCourse.ts';
import { schoolPosition } from '../domain/school.ts';
import { prettyName } from '../story/format.ts';
import { KifuBoard } from './KifuBoard.tsx';

function CountPosition({ game }: { game: GameRecord }) {
  const moves = useMemo(() => decodeMoves(game.moves), [game]);
  const board = useMemo(() => schoolPosition(game, moves.length), [game, moves.length]);
  const prisoners = useMemo(
    () => prisonersAt(buildTimeline(decodePoints(game.setupBlack), moves), moves.length),
    [game, moves],
  );
  const [dead, setDead] = useState<number[]>([]);
  const [seki, setSeki] = useState<number[]>([]);
  const [mark, setMark] = useState<'dead' | 'seki'>('dead');
  const [coordinate, setCoordinate] = useState('');
  const [komi, setKomi] = useState(game.komi === undefined ? '' : String(game.komi));
  const [agreed, setAgreed] = useState(false);
  const [score, setScore] = useState<JapaneseScore>();
  const [error, setError] = useState('');
  function designate(p: number) {
    const group = board.stonesOf(p);
    if (!group.length) return;
    const current = mark === 'dead' ? dead : seki;
    const other = mark === 'dead' ? seki : dead;
    const updated = current.includes(p)
      ? current.filter((x) => !group.includes(x))
      : [...current, ...group];
    const clear = other.filter((x) => !group.includes(x));
    if (mark === 'dead') {
      setDead(updated);
      setSeki(clear);
    } else {
      setSeki(updated);
      setDead(clear);
    }
    setScore(undefined);
    setError('');
    setAgreed(false);
  }
  function enter(e: FormEvent) {
    e.preventDefault();
    const p = pointFromHuman(coordinate);
    if (p !== null) designate(p);
    setCoordinate('');
  }
  function count() {
    if (!agreed || komi.trim() === '' || !Number.isFinite(Number(komi))) {
      setError('Indiquez un komi et confirmez les hypothèses de comptage.');
      return;
    }
    try {
      setScore(countJapaneseScore(board, prisoners, { dead, seki, komi: Number(komi) }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScore(undefined);
    }
  }
  return (
    <div className="school-exercise">
      <div className="school-exercise__intro">
        <p className="chapter__index">Atelier d’application · Comptage japonais</p>
        <h2>Terminez le décompte</h2>
        <p>Dernière position du kifu, coup {moves.length}.</p>
      </div>
      <div className="school-exercise__board">
        <KifuBoard
          game={game}
          before={moves.length}
          anchors={[]}
          board={board}
          resultBoard={board}
          played={[]}
          full={true}
          onPlay={designate}
          allowOccupied
          dead={dead}
          seki={seki}
        />
        <p className="school-caption">
          Pierre estompée : morte selon votre hypothèse. Anneau bleu : groupe déclaré en seki.
        </p>
      </div>
      <div className="school-exercise__lesson">
        <p>
          {prettyName(game.black)} – {prettyName(game.white)} · {game.date} · résultat enregistré :{' '}
          {game.result.raw}.
        </p>
        <p className="school-note">
          Les passes et l’accord final des joueurs ne sont pas conservés dans ces anciens kifus. Le
          calcul ci-dessous explore un accord hypothétique ; il ne reconstruit pas automatiquement
          leur score.
        </p>
        <p>
          Prisonniers constatés : Noir {prisoners.B}, Blanc {prisoners.W}.
        </p>
        <div className="school-answer-grid">
          <button
            className="chip"
            type="button"
            aria-pressed={mark === 'dead'}
            onClick={() => setMark('dead')}
          >
            Marquer les morts
          </button>
          <button
            className="chip"
            type="button"
            aria-pressed={mark === 'seki'}
            onClick={() => setMark('seki')}
          >
            Marquer les sekis
          </button>
        </div>
        <form className="school-coordinate" onSubmit={enter}>
          <label htmlFor="count-coordinate">Désigner un groupe par une coordonnée</label>
          <div>
            <input
              id="count-coordinate"
              value={coordinate}
              maxLength={3}
              onChange={(e) => setCoordinate(e.target.value)}
            />
            <button className="chip" type="submit">
              Marquer
            </button>
          </div>
        </form>
        <label>
          Choisissez le komi {game.komi === undefined ? '(non documenté dans ce kifu)' : ''}
          <input
            className="school-score-input"
            type="number"
            step="0.5"
            value={komi}
            onChange={(e) => {
              setKomi(e.target.value);
              setScore(undefined);
              setAgreed(false);
            }}
          />
        </label>
        <label className="school-check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              setScore(undefined);
            }}
          />{' '}
          Je confirme cette hypothèse de pierres mortes, chaînes en seki et komi.
        </label>
        <button type="button" className="chip chip--accent" onClick={count}>
          Calculer sous ces hypothèses
        </button>
        {error && <p role="alert">{error}</p>}
        {score && (
          <div role="status" className="school-explanation">
            <h3>Décompte conditionnel</h3>
            <p>
              Noir : {score.territory.B} de territoire + {score.prisoners.B} prisonniers ={' '}
              {score.points.B} points.
            </p>
            <p>
              Blanc : {score.territory.W} de territoire + {score.prisoners.W} prisonniers +{' '}
              {score.komi} de komi = {score.points.W} points.
            </p>
            <p>
              {score.neutral} points neutres ; résultat conditionnel :{' '}
              {score.winner === 'jigo'
                ? 'égalité'
                : (score.winner === 'B' ? 'Noir' : 'Blanc') + ' +' + score.margin}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function JapaneseCountWorkshop({
  games,
  onBack,
}: {
  games: readonly GameRecord[];
  onBack: () => void;
}) {
  const finished = useMemo(
    () =>
      games.filter(
        (g) =>
          !g.imported &&
          !g.rengo &&
          g.result.margin !== undefined &&
          !g.result.resign &&
          g.moves.length > 0,
      ),
    [games],
  );
  const [id, setId] = useState(finished[0]?.id ?? '');
  const game = finished.find((g) => g.id === id);
  return (
    <section>
      <div className="school-welcome">
        <button className="link" type="button" onClick={onBack}>
          ← Programme
        </button>
        <h2>Atelier : compter une partie historique</h2>
        <label>
          Partie enregistrée
          <select value={id} onChange={(e) => setId(e.target.value)} className="school-score-input">
            {finished.map((g) => (
              <option key={g.id} value={g.id}>
                {g.date} · {prettyName(g.black)} / {prettyName(g.white)} · {g.result.raw}
              </option>
            ))}
          </select>
        </label>
      </div>
      {game && <CountPosition key={game.id} game={game} />}
    </section>
  );
}
