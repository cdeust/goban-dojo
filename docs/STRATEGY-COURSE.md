# Parcours stratégique : études de kifu

## Objectif et métrique

Compléter l’apprentissage tactique par sept modules d’observation stratégique (quatre modules
d’ouverture au niveau interne 7, trois modules de milieu de partie au niveau interne 8). Ces niveaux
organisent le parcours ; ils ne correspondent pas à une certification kyu/dan.

Critère quantitatif : 12 études par module, soit 84 positions distinctes, vérifiées contre le corpus
historique distribué par l’application. Chaque position comporte un coup historique et un ou deux
autres coups à comparer. L’objectif pédagogique est d'apprendre à formuler et tester un choix
stratégique, non de mémoriser le premier coup d'une partie.

## Provenance

`extractStrategyCourse` rejoue intégralement le préfixe de chaque position candidate depuis le
kifu ; aucune pierre n'est ajoutée ni déplacée. Le préfixe s'arrête à toute violation des règles
détectable par le moteur de plateau. Les références `gameId`, `before` et `sources` désignent
respectivement la partie, le nombre de coups déjà joués et les identifiants des sources.
`historicalLine` reproduit les cinq demi-coups suivants, sans inventer de suite.

Les alternatives sont des intersections jouées ultérieurement par la même couleur dans ce même
kifu (jusqu'à 24 demi-coups après la position), puis vérifiées légales à la position étudiée, y
compris au regard des répétitions positionnelles. Leurs indices exacts sont conservés. Il s'agit
d'hypothèses contrefactuelles sur l'ordre des coups et non de variantes effectivement jouées.

## Critères pédagogiques

- Fuseki : le coup enregistré occupe un secteur de coin de 6 × 6 encore vide.
- Approche : le coup enregistré est en saut de cavalier par rapport à une pierre adverse de coin.
- Échanges de coin : le coup historique répond à proximité du dernier coup et d'une pierre amie.
  Aucun joseki canonique n'est déduit de cette géométrie.
- Direction : développement à 2–4 intersections d'une pierre amie, sur la même ligne d'un côté.
- Influence : développement vers le centre à proximité d'une chaîne amie de trois pierres ou plus
  et disposant d'au moins quatre libertés. Cela n'est pas une preuve de vie.
- Réduction/invasion : coup à proximité de pierres adverses dans plusieurs directions, sans
  soutien ami immédiat. La proximité n'établit pas un territoire acquis.
- Initiative : le kifu change de secteur néanmoins une réponse locale candidate existe. Une
  distance géographique n'établit pas le sente.

Le kifu ne certifie pas l'optimalité des choix. L'observation factuelle est révélée après le choix
du joueur. L'évaluation par moteur doit être présentée séparément (avec ses paramètres et
l'incertitude de l'évaluation), et non confondue avec une vérité historique.

## Validation

`pnpm exec vitest run tests/strategyCourse.test.ts` : couverture du nombre de cas par module,
diversité temporelle, reproductibilité indépendante de l'ordre de corpus, conformité exacte au
kifu, légalité des coups au préfixe et contrôles géométriques indépendants.
