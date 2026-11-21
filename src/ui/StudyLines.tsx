import { useRef, useState } from 'react';
import { opposite, PASS, pointToHuman, type Color } from '../domain/board.ts';
import type { GameRecord } from '../domain/game.ts';
import { nextColor, timelineOf, useStore } from '../state/store.ts';
import { colorName } from '../story/format.ts';
import { useStudyLines } from './useStudyLines.ts';

const signedPoints = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const points = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const visibleRows = 3;
type LineRow = ReturnType<typeof useStudyLines>['rows'][number];

function Ranking({
  rows,
  offset,
  color,
  selected,
  hasReference,
  choose,
}: {
  rows: readonly LineRow[];
  offset: number;
  color: Color;
  selected: number | null;
  hasReference: boolean;
  choose: (row: LineRow) => void;
}) {
  return (
    <table
      className="study__lines"
      aria-label={offset ? 'Autres premiers coups évalués' : 'Premiers coups évalués'}
    >
      <thead>
        <tr>
          <th scope="col">Premier coup</th>
          <th scope="col">Score pour {colorName(color)}</th>
          {hasReference && <th scope="col">Écart au kifu</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.point}>
            <th scope="row">
              <button
                type="button"
                className="study__line-choice"
                aria-pressed={row.point === selected}
                aria-label={'Lire la suite ' + pointToHuman(row.point)}
                onClick={() => choose(row)}
              >
                {offset + i + 1}. {pointToHuman(row.point)}
              </button>
              {row.recorded && <span className="study__kifu">Kifu</span>}
            </th>
            <td>{signedPoints.format(row.lead)} pt</td>
            {hasReference && (
              <td>{row.delta === null ? '—' : signedPoints.format(row.delta) + ' pt'}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StudyLines({ game, base }: { game: GameRecord; base: number }) {
  const prefix = useStore((s) => s.variation);
  const displayedColor = useStore(nextColor);
  const show = useStore((s) => s.showStudyLine);
  const setMode = useStore((s) => s.setMode);
  const [comparing, setComparing] = useState(() => prefix.length > 0);
  const [selected, setSelected] = useState<number | null>(() => prefix[0]?.point ?? null);
  const [restored] = useState(prefix);
  const reader = useRef<HTMLHeadingElement>(null);
  const { rows, moves, ranking, reading, error, retry, finished, next } = useStudyLines(
    game,
    base,
    comparing,
    selected,
  );
  const kifu = timelineOf(game).moves;
  const actual = kifu[base];
  const step = prefix.length;
  const last = prefix.at(-1) ?? kifu[base - 1];
  const beforeLast = step > 1 ? prefix.at(-2) : kifu[base - (step === 1 ? 1 : 2)];
  const ended = last?.point === PASS && beforeLast?.point === PASS;
  const saved = restored[0]?.point === selected && restored.length > step ? restored : prefix;
  const line = moves[0]?.point === selected && moves.length >= saved.length ? moves : saved;
  const selectedRow = rows.find((row) => row.point === selected);
  const best = rows[0];
  const recorded = rows.find((row) => row.recorded);
  const advantage = best && recorded ? points.format(best.lead - recorded.lead) : null;

  function choose(row: LineRow) {
    setSelected(row.point);
    show([{ color: next, point: row.point }]);
    requestAnimationFrame(() => {
      reader.current?.focus({ preventScroll: true });
      reader.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
    });
  }

  return (
    <div className="study__workspace">
      <p className="study__anchor">
        <strong>
          {ended ? 'Deux passes consécutives' : colorName(displayedColor) + ' au trait'}
        </strong>
        {' · '}
        {step > 0
          ? 'Coup simulé ' + (base + step)
          : base
            ? 'Après le coup ' + base + ' du kifu'
            : 'Position initiale'}
        {last && ' · ' + colorName(last.color) + ' ' + pointToHuman(last.point)}
      </p>
      <div className="study__actions">
        <button
          type="button"
          className="chip chip--accent"
          aria-expanded={comparing}
          aria-controls={comparing || finished ? 'study-comparison' : undefined}
          disabled={finished && !comparing}
          onClick={() => {
            if (comparing) {
              show([]);
              setSelected(null);
            }
            setComparing(!comparing);
          }}
        >
          {comparing ? 'Masquer les suites' : 'Comparer les suites'}
        </button>
        <button
          type="button"
          className="chip"
          disabled={finished}
          onClick={() => {
            show([]);
            setMode('explorer');
          }}
        >
          {step ? 'Jouer à partir du kifu' : 'Jouer mon coup'}
        </button>
      </div>
      {(comparing || finished) && (
        <section
          className="study__comparison"
          id="study-comparison"
          aria-label="Comparaison des suites"
        >
          {finished ? (
            <p role="status">
              La partie s’est terminée par deux passes. Reculez d’un coup pour comparer les suites.
            </p>
          ) : (
            <>
              <h3>Suites avant le coup {base + 1}</h3>
              <p className="study__benchmark">
                {actual ? (
                  <>
                    Coup du kifu ·{' '}
                    <strong>
                      {colorName(actual.color)} {pointToHuman(actual.point)}
                    </strong>
                    {recorded && ' · ' + signedPoints.format(recorded.lead) + ' pt'}.
                    {!ranking &&
                      recorded &&
                      best &&
                      (best.point === recorded.point || best.lead === recorded.lead
                        ? ' En tête des coups évalués.'
                        : advantage === '0'
                          ? ' L’écart estimé avec ' +
                            pointToHuman(best.point) +
                            ' est inférieur à 0,1 pt.'
                          : ' Avec ' +
                            pointToHuman(best.point) +
                            ', KataGo estime un gain de ' +
                            advantage +
                            ' pt pour ' +
                            colorName(next) +
                            ' par rapport au coup du kifu.')}
                  </>
                ) : (
                  'Le kifu s’arrête ici. Les suites prolongent la dernière position enregistrée.'
                )}
              </p>
              {!ranking && rows.length > 0 && (
                <>
                  <p className="study__score-note">
                    KataGo estime le score pour {colorName(next)} après la réponse prévue, avec un
                    komi de {points.format(game.komi ?? 0)} pt. Un score positif indique une avance,
                    un score négatif un retard.
                    {rows.some((row) => row.horizon === 1) &&
                      ' Une seconde passe met fin à la suite dès le premier coup.'}
                  </p>
                  <p>Choisissez un premier coup pour voir sa suite sur le goban.</p>
                  <Ranking
                    rows={rows.slice(0, visibleRows)}
                    offset={0}
                    color={next}
                    hasReference={!!actual}
                    selected={selected}
                    choose={choose}
                  />
                  {rows.length > visibleRows && (
                    <details className="study__more">
                      <summary>Voir les autres coups ({rows.length - visibleRows})</summary>
                      <Ranking
                        rows={rows.slice(visibleRows)}
                        offset={visibleRows}
                        color={next}
                        hasReference={!!actual}
                        selected={selected}
                        choose={choose}
                      />
                    </details>
                  )}
                </>
              )}
              {ranking && (
                <p>
                  <span role="status">Calcul du classement en cours…</span>
                  {rows.length > 0 && (
                    <span aria-hidden="true">
                      {' '}
                      {rows.length} premier{rows.length > 1 ? 's' : ''} coup
                      {rows.length > 1 ? 's' : ''} évalué{rows.length > 1 ? 's' : ''}.
                    </span>
                  )}
                </p>
              )}
              {!ranking && !error && !rows.length && (
                <p role="status">Aucun coup à comparer dans cette position.</p>
              )}
              {error && (
                <div className="study__error" role="status">
                  <p>Calcul interrompu · {error}</p>
                  <button type="button" className="chip" onClick={retry}>
                    Réessayer le calcul
                  </button>
                </div>
              )}
              {selected !== null && (
                <section
                  className="study__line-reader"
                  aria-labelledby="study-line-title"
                  data-first={pointToHuman(selected)}
                  data-step={step}
                >
                  <h3 id="study-line-title" ref={reader} tabIndex={-1}>
                    {selected === PASS
                      ? 'Suite après une passe'
                      : 'Suite en ' + pointToHuman(selected)}
                  </h3>
                  <p>
                    {selectedRow?.reply != null
                      ? 'Réponse prévue · ' +
                        colorName(opposite(next)) +
                        ' ' +
                        pointToHuman(selectedRow.reply)
                      : selectedRow?.horizon === 1
                        ? 'La passe termine la partie.'
                        : 'Lecture de la suite.'}
                  </p>
                  <label className="study__scrubber">
                    Coup de la suite · {step} / {line.length}
                    <input
                      type="range"
                      aria-label="Coup de la suite"
                      min={0}
                      max={line.length}
                      value={step}
                      disabled={!line.length}
                      aria-valuetext={
                        step === 0 ? 'Position du kifu' : 'Coup ' + step + ' sur ' + line.length
                      }
                      onChange={(event) => show(line.slice(0, Number(event.currentTarget.value)))}
                    />
                  </label>
                  <div className="study__actions">
                    <button
                      className="chip"
                      type="button"
                      aria-label="Coup précédent de la suite"
                      disabled={step === 0}
                      onClick={() => show(line.slice(0, step - 1))}
                    >
                      ← Précédent
                    </button>
                    <button
                      className="chip"
                      type="button"
                      aria-label="Coup suivant de la suite"
                      disabled={step >= line.length}
                      onClick={() => show(line.slice(0, step + 1))}
                    >
                      Suivant →
                    </button>
                  </div>
                  {reading && <p role="status">Calcul de la suite en cours…</p>}
                  <div className="study__actions">
                    <button
                      type="button"
                      className="chip chip--accent"
                      disabled={ended}
                      onClick={() => setMode('explorer')}
                    >
                      Essayer cette suite
                    </button>
                    <button
                      type="button"
                      className="chip"
                      disabled={ended}
                      onClick={() => setMode('lire')}
                    >
                      Lire 60 coups d’avance
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
