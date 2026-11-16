import { useStore } from '../state/store.ts';
import { SOURCES } from '../story/chapters.ts';
import { IconClose } from './icons.tsx';
import { SHORTCUTS } from './useKeyboard.ts';

/** Aide, sources et réserves sur les données. Boîte de dialogue native, modale. */
export function HelpDialog() {
  const dataset = useStore((s) => s.dataset);
  const suspect = dataset?.games.filter((g) => g.dateSuspect).length ?? 0;
  return (
    <dialog id="help" className="dialog" aria-labelledby="help-title" {...{ closedby: 'any' }}>
      <form method="dialog" className="dialog__close">
        <button type="submit" className="icon-button" aria-label="Fermer" autoFocus>
          <IconClose />
        </button>
      </form>
      <h2 id="help-title">Aide &amp; sources</h2>

      <h3>Clavier</h3>
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p>
        La souris ou le doigt font tourner la caméra autour du goban ; la molette règle la distance.
      </p>

      <h3>Sources</h3>
      <ul className="sources">
        {SOURCES.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
            <span> — {s.detail}</span>
          </li>
        ))}
      </ul>

      <h3>Ce qu’il faut savoir des données</h3>
      <ul className="notes">
        <li>
          Le corpus réunit {dataset?.games.length ?? 0} parties distinctes, tirées de{' '}
          {dataset?.generatedFrom.files ?? 0} fichiers SGF ; les doublons ont été fusionnés, y
          compris ceux enregistrés sous une autre orientation du goban.
        </li>
        <li>
          Chaque partie a été rejouée par un moteur de règles : aucun coup illégal n’a été relevé.
        </li>
        <li>
          Les dates sont celles de la source, qui mêle calendrier grégorien et calendrier lunaire
          japonais : les parties du château, datées « 17 novembre », se jouaient le 17ᵉ jour du 11ᵉ
          mois lunaire.
        </li>
        {suspect > 0 && (
          <li>
            {suspect} parties portent une date incompatible avec la vie de Shūsaku (1839, sixième
            dan) : elles sont classées à part, sous « Dates incertaines ».
          </li>
        )}
        <li>
          Le matériel est modélisé aux cotes du goban japonais (42,42 × 45,45 × 15,15 cm, lignes
          espacées de 22 et 23,7 mm) d’après Sensei’s Library, « Equipment Dimensions ».
        </li>
      </ul>
    </dialog>
  );
}
