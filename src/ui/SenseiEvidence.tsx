import evidence from '../story/senseiEvidence.json';

const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
export function SenseiEvidence() {
  return (
    <section className="school-welcome" aria-labelledby="sensei-evidence-title">
      <p className="chapter__index">Méthode du dojo · Transparence</p>
      <h2 id="sensei-evidence-title">Comment le Sensei vérifie ses conseils</h2>
      <p>
        Les règles du go vérifient les faits sur le goban. Leela Zero produit des variantes ; KataGo
        les compare indépendamment. Une estimation n’est pas une preuve de victoire.
      </p>
      <details>
        <summary>Benchmark public : {evidence.moves} décisions professionnelles</summary>
        <p>
          {evidence.game} ({evidence.date}), {evidence.black} contre {evidence.white}. Le moteur
          embarqué a joué un coup à chacune des positions historiques, à {evidence.visits} visites,
          évalué à partir du même goban par KataGo.
        </p>
        <p>
          <strong>{evidence.same} coups identiques</strong> · {evidence.gainAtLeast2} meilleurs d’au
          moins 2 points · {evidence.lossAtLeast2} moins bons d’au moins 2 points ·{' '}
          {evidence.within2} dans la marge de 2 points.
        </p>
        <p>
          Écart moyen estimé : {n.format(evidence.meanDelta)} point par décision. Une seule partie,
          sans match réel ; les écarts ne se cumulent pas et aucun grade de jeu n’est certifié.
        </p>
        <p>
          <a href={evidence.official} target="_blank" rel="noreferrer noopener">
            Résultat officiel Nihon Ki-in
          </a>{' '}
          ·{' '}
          <a href={evidence.source} target="_blank" rel="noreferrer noopener">
            Kifu source
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/cdeust/goban-dojo/blob/main/docs/BENCHMARK-SENSEI.md"
            target="_blank"
            rel="noreferrer noopener"
          >
            Protocole et résultats vérifiables
          </a>
        </p>
      </details>
    </section>
  );
}
