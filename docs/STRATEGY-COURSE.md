# Parcours stratégique : études de kifu

## Objectif et métrique

Compléter l’apprentissage tactique par quinze modules d’observation stratégique : huit modules intermédiaires, du niveau interne 2 au niveau interne 6, puis les sept modules historiques (quatre d’ouverture au niveau 7 et trois de milieu de partie au niveau 8). Ces niveaux organisent le parcours ; ils ne correspondent pas à une certification kyu/dan.

Critère quantitatif : 12 études par module stratégique et 16 par module intermédiaire, soit 212 positions distinctes (180 existantes conservées et 32 nouvelles), vérifiées contre le corpus
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

## De l’ouverture au milieu de partie : progression intermédiaire

| Niveau | Compétence            | Exemple observable dans une partie réelle                                                                                                                 |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2      | Premiers points       | Coin 6 × 6 encore vacant, point de troisième ou quatrième ligne par rapport à chacun des deux bords. Quatre positions pour chacun des 2e, 3e et 4e coups. |
| 3      | Shimari               | Une seule pierre amie dans le coin, aucune pierre adverse, puis un saut de cavalier. Le cadre n’est pas fermé.                                            |
| 4      | Extension et base     | Deux pierres sur la même troisième ou quatrième ligne, séparées par deux à quatre intersections vides ; la base n’est pas déclarée vivante.               |
| 4      | Approche et réponse   | Kakari en saut de cavalier auprès d’un point de coin adverse, sans pierre amie dans le secteur avant l’approche.                                          |
| 5      | Connexion et forme    | Réunion d’au moins deux chaînes distinctes ; effectif et libertés de la chaîne résultante vérifiés.                                                       |
| 5      | Sortie vers le centre | Saut rectiligne d’une intersection en s’éloignant du bord ; point de coupure situé entre les deux pierres.                                                |
| 6      | Après l’échange local | Trois coups consécutifs dans un même coin puis changement de secteur à huit intersections ou plus ; un soutien ami existe près du nouveau coup.           |
| 6      | Groupe vulnérable     | Renforcement d’une chaîne de deux pierres ou plus disposant de deux ou trois libertés ; au moins deux libertés de plus dans la chaîne résultante.         |

Chaque étude permet de rejouer les cinq demi-coups réellement enregistrés après la position, avec les numéros d’origine. Les commandes précédent/suivant rendent l'alternance visible ; on peut également observer la position avant le choix. Une consultation sans évaluation est enregistrée comme réponse dévoilée, jamais comme réussite sans aide. La comparaison KataGo reste possible et distincte de ce rejeu. Le carnet recommande les nouvelles compétences à leur niveau intermédiaire, avant les niveaux 7 et 8.

Les concepts pédagogiques s'appuient sur les ressources de la [Nihon Ki-in, The Opening (1)](https://archive.nihonkiin.or.jp/lesson/school-e/joban01.htm) (coût de délimitation selon le lieu, lignes du goban, phases), de la [British Go Association, Raising Your Strength - Part 2](https://britgo.org/bgj/00223.html) (fermeture du coin et extensions), de [Learning something useful from a joseki](https://www.britgo.org/shodan/learnfromjoseki1) (lien entre séquence locale, forces environnantes et potentiel de sortie), et de [What Is Good Shape?](https://britgo.org/bgj/06329.html) (formes, largeur des extensions et contexte). Ces sources étayent les notions, pas les coups : les positions viennent exclusivement des SGF référencés par les données du dojo.

### Limites

Le corpus de Shūsaku est du XIXe siècle : il n’est ni un dictionnaire exhaustif des joseki contemporains ni un échantillon représentatif des ouvertures modernes. Les douze premiers exercices illustrent onze komoku (3–4) et un hoshi (4–4). Le san-san (3–3) est présenté comme notion et non comme exemple attesté dans ces douze positions de coins vides. Aucun ordre des coups ni forme n’est déclaré universellement optimal. Il faudra un corpus moderne dont les droits, la provenance et les annotations sont établis pour entraîner de manière exhaustive les ouvertures d’après l’IA.

## Critères pédagogiques des sept modules historiques

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

La suite des cinq coups est comparée indépendamment à la reconstitution du SGF, à chaque pas. Les tests Playwright ouvrent un module de niveau 2 depuis le carnet, rejouent les cinq coups dans les deux sens, et vérifient la véritable comparaison KataGo dans Chromium local.
