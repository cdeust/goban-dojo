# L’évaluation des coups

Le lecteur utilise **Leela Zero nº 116** pour les simulations des pauses tactiques et, par défaut,
pour la lecture longue. Le réseau a appris par autojeu. Il propose des coups et estime l’issue
d’une position. Le navigateur explore les réponses avec une recherche en arbre PUCT. La lecture longue indique la probabilité de victoire de Noir selon les règles chinoises avec le komi de 7,5 du réseau. Dans l’encart de simulation, les suites de Leela Zero reçoivent une estimation en points avec le komi du kifu.

Les pauses rejouent les branches sur le goban de la partie. Lorsqu’un seul coup concentre
toutes les visites, une recherche séparée permet d’examiner d’autres premiers coups légaux.
Chaque pause propose d’abord dix branches de vingt demi-coups au maximum. Le lecteur peut
demander davantage de branches ou prolonger uniquement celle qu’il souhaite étudier.
En lecture longue, les horizons de départ sont de 60, 120 et 240 demi-coups. On peut augmenter
l’horizon par tranches de 60 et demander d’autres réponses à une position déjà calculée.
Deux passes mettent fin à la projection. Une succession de recherches locales ne mesure pas
la profondeur atteinte par une recherche unique. Les positions d’un SGF importé sont analysées
dans le navigateur selon la même procédure. [Poids, conversion et vérification](LEELA-ZERO.md)

## Continuer après un abandon

Dans la bibliothèque, cochez « Parties terminées par abandon ». Le bouton « Continuer après
l’abandon » dans la fiche ouvre la position finale du kifu. Les imports SGF avec un résultat
`B+R`, `W+R`, `B+Resign` ou `W+Resign` suivent le même parcours. Le résultat de la partie reste
affiché pendant la simulation. Le joueur au trait se déduit du dernier coup enregistré.
« Comparer 10 variantes de 20 coups » ouvre dix continuations depuis cette position. Chaque variante part d’un premier coup différent et peut se terminer plus tôt après deux passes. « Revenir au kifu » rétablit la position et le résultat historique.

## Évaluation en points avec KataGo

Dans le mode « Explorer », un réseau de neurones de KataGo juge chaque coup posé — et, pour
comparaison, le coup réellement joué dans la partie. Tout tourne dans le navigateur : aucune
position n’est envoyée à un serveur.

Dans une simulation, l’avance est réévaluée après chaque coup affiché. La variation indique de combien cette avance a changé pour le joueur qui vient de jouer. Par exemple, si l’avance de Noir passe de 4,2 à 2,8 après une réponse blanche, Blanc a gagné 1,4 point dans l’estimation. Le classement compare les premiers coups depuis la même position, y compris le coup historique s’il existe. En pause sur une réponse, on peut aussi la comparer aux autres coups évalués à ce tour.

Le komi d’équilibre est la compensation estimée qui mettrait les deux camps à égalité. Il s’obtient en ajoutant au komi du kifu l’avance signée de Noir. Un résultat négatif indique une compensation pour Noir. En l’absence de komi dans le kifu, le lecteur retient zéro. Il s’agit d’une estimation du score final en règles japonaises, qui comprend aussi les prisonniers. [Définition de l’avance dans KataGo](https://github.com/lightvector/KataGo/blob/v1.18.2/docs/Analysis_Engine.md#L218-L230) · [Calcul du komi d’équilibre](https://github.com/lightvector/KataGo/blob/v1.18.2/cpp/program/playutils.cpp#L569-L585)

## Ce qui est livré

| Élément            | Valeur                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Réseau             | `kata1-b10c128-s1141046784-d204142634` (10 blocs, 128 canaux), 12,0 Mo                                                                         |
| Origine            | <https://media.katagotraining.org/uploaded/networks/models/kata1/>, SHA-256 `3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4` |
| Conversion         | `katago dumponnx` (outil officiel, KataGo v1.18.2), poids inchangés                                                                            |
| Fichier ONNX       | `public/engine/…onnx`, SHA-256 `293bf3c07a74e541dca65f086fac8ae62703290d05810dfc603f5d7070f11122`                                              |
| Moteur d’inférence | `onnxruntime-web` 1.31.1 (MIT), WebAssembly, un seul fil, dans un Web Worker                                                                   |
| Licence du réseau  | `public/engine/LICENCE.txt` (domaine public CC0 pour l’entraînement g170 ; licence KataGo de type MIT reproduite par précaution)               |

Le réseau et le moteur (environ 16 Mo transférés) ne sont chargés que si l’utilisateur clique
sur « Évaluer les coups ». Le navigateur vérifie la taille et l’empreinte SHA-256 du réseau avant
de s’en servir.

## Comment un coup est jugé (`src/engine/judge.ts`)

Le réseau est interrogé **sans recherche arborescente** : une inférence donne, pour une position,
les coups qu’il préfère, la probabilité de gain et l’avance estimée en points. Pour juger un coup
M dans une position P :

1. évaluer P, retenir ses cinq coups préférés ;
2. évaluer la position après M et après chacun de ces cinq coups ;
3. la **perte** de M est l’écart d’avance entre le meilleur de ces coups et M.

| Perte estimée     | Verdict affiché |
| ----------------- | --------------- |
| moins de 2 points | bon coup        |
| de 2 à 5 points   | discutable      |
| 5 points ou plus  | erreur probable |

Sept inférences par coup, soit environ une seconde sur un ordinateur récent.

## Ce que vaut ce jugement

Mesure faite pendant l’étude de faisabilité, sur 60 positions du corpus et un coup alternatif
chacune, contre une référence plus forte (réseau `tf2-b10c384` avec environ 100 visites) :

| Réseau, inférence seule | Erreur moyenne | Corrélation | Coups perdant ≥ 5 points : détectés / fausses alertes / manqués |
| ----------------------- | -------------- | ----------- | --------------------------------------------------------------- |
| b6c96                   | 3,4 points     | 0,53        | 12 / 9 / 3                                                      |
| **b10c128 (livré)**     | 1,85 point     | 0,92        | 12 / 5 / 3                                                      |
| b15c192 (40 Mo)         | 1,7 point      | 0,92        | 13 / 4 / 2                                                      |

D’où le choix du b10c128, et des catégories larges plutôt qu’un chiffre au demi-point. Il faut
lire ces verdicts pour ce qu’ils sont : l’intuition d’un réseau fort, sans lecture. Un « bon
coup » est un coup qu’il ne sait pas distinguer du meilleur ; une « erreur probable » se trompe
environ une fois sur trois. L’échantillon est petit (60 positions) et les seuils n’ont pas été
calibrés au-delà.

## Vérification du portage

L’encodage des positions (`src/engine/features.ts`) est un portage en TypeScript du code de
KataGo (`NNInputs::fillRowV7`, recherche de shicho comprise). `tests/engine.test.ts` le fait
tourner sur le réseau b6c96 et compare ses sorties à celles de **KataGo natif** (v1.18.2, backend
Eigen, une visite, sans aléa) sur 53 positions tirées des parties de Shūsaku, dont 15 à
handicap : mêmes coups illégaux, même premier choix, probabilités à moins de 10⁻⁴, probabilité de
gain à moins de 10⁻⁴, avance à moins de 10⁻³ point.

La référence (`tests/fixtures/katago-b6c96-reference.json`) a été produite pendant l’étude de
faisabilité avec un KataGo compilé depuis les sources ; elle n’a pas été régénérée depuis.
Elle porte sur le b6c96 : pour le b10c128 livré, la fidélité repose sur le même encodeur et sur
la conversion officielle, pas sur une comparaison directe.

## Limites

- Pas de recherche : les séquences forcées longues (semeai, shicho complexes, vie et mort) sont
  mal jugées.
- Règles japonaises sans komi, comme les parties d’époque ; le cas particulier du double ko dans
  la recherche de shicho n’est pas porté.
- Mesuré seulement sous Chromium sur un processeur Apple M4 : environ 45 à 65 ms par inférence.
  Safari, Firefox et les mobiles n’ont pas été essayés.
- Les coups de la partie elle-même ne sont jugés qu’à la demande, position par position : il n’y
  a pas d’analyse précalculée des 85 577 coups (estimée à une soixantaine d’heures de calcul avec
  une vraie recherche).

## Lire les variantes

Depuis un coup du kifu, « Analyser » classe jusqu’à douze coups légaux d’après la politique
brute du réseau. Si le coup enregistré est plus bas dans le classement, il remplace la
dernière option affichée et conserve son rang réel. L’écran examine ensuite chaque position
fille, une à une, et compte jusqu’à douze réponses par option. Au maximum, treize inférences
donnent ainsi 144 suites de deux coups avec une estimation après le premier coup de chacune.

Cliquer sur une option ou jouer sur le goban déplace la racine de cette analyse. Les évaluations
sont réutilisées au sein de la séance. Le pourcentage décrit la préférence initiale du réseau.
La comparaison avec le kifu porte sur l’avance estimée du joueur au trait après le premier
coup. Ces sorties viennent d’un modèle moderne entraîné en autojeu. Elles ne renseignent
pas sur les intentions historiques d’un joueur.

## Lecture longue avec KataGo

Avec KataGo sélectionné, les écrans de réflexion et d’analyse ouvrent une projection de 60, 120 ou 240 coups. À
chaque position, le navigateur compare les cinq coups préférés du réseau à partir de
l’avance estimée après chacun, comme dans le jugement de coups. Il conserve les choix
et répète le calcul pour le camp adverse. Le coup du kifu ou une bifurcation choisie
est évalué en plus s’il n’est pas déjà dans les cinq premiers.

La courbe rapporte les estimations position par position. La carte « Territoires estimés »
affiche la sortie de propriété du réseau, du point de vue de Noir, avec une couleur
continue par intersection. Les ataris, sorties d’atari, captures et connexions sont
calculés avec les règles du goban. La lecture s’arrête après
deux passes. La longueur indique l’horizon de la projection, avec une comparaison locale
à chaque coup. Elle ne correspond ni à un arbre de profondeur équivalente, ni au
raisonnement historique des joueurs.
