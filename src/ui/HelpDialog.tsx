import { TacticalLegendHelp } from './TacticalLegend.tsx';
import { useStore } from '../state/store.ts';
import { SOURCES } from '../story/chapters.ts';
import { IconClose } from './icons.tsx';
import { SHORTCUTS } from './useKeyboard.ts';

/** Aide, sources et réserves sur les données. Boîte de dialogue native, modale. */
export function HelpDialog() {
  const dataset = useStore((s) => s.dataset);
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

      <h3>Ce que montrent les marques</h3>
      <TacticalLegendHelp />

      <h3>Vos parties</h3>
      <p>
        Importez un kifu SGF 19 × 19 depuis Parties. Le lecteur suit la première branche du fichier.
        Les imports restent dans ce navigateur. Le mode Deviner permet de choisir Noir ou Blanc. Les
        estimations utilisent le komi du kifu et l’évaluation de KataGo en règles japonaises.
      </p>

      <h3>Sources du corpus de Shūsaku</h3>
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
          Le corpus réunit {dataset?.games.filter((game) => !game.imported).length ?? 0} parties, de
          décembre 1839 à juin 1862 : les {dataset?.generatedFrom.cwi.files ?? 0} fichiers de la
          collection d’A. E. Brouwer, moins une partie de 1842 dont le kifu est perdu. Quatre sont
          des rengo, où Shūsaku joue en équipe.
        </li>
        <li>
          Chaque partie a été rejouée par un moteur de règles : aucun coup illégal n’a été relevé.
        </li>
        <li>
          Les dates sont grégoriennes ; la date du calendrier japonais est rappelée sous chacune.
          Les parties du château se jouaient le 17ᵉ jour du 11ᵉ mois lunaire, soit en décembre ou en
          janvier. Quelques parties ne sont datées qu’au mois ou à l’année.
        </li>
        <li>
          Une cinquantaine de parties sont inachevées ou d’issue inconnue : la relecture s’arrête où
          s’arrête le kifu.
        </li>
        <li>
          Aucun kifu antérieur à décembre 1839 n’a été trouvé : les parties de l’enfance à Innoshima
          ne sont connues que par le récit.
        </li>
        <li>
          Le matériel est modélisé aux cotes du goban japonais (42,42 × 45,45 × 15,15 cm, lignes
          espacées de 22 et 23,7 mm) d’après Sensei’s Library, « Equipment Dimensions ».
        </li>
      </ul>
    </dialog>
  );
}
