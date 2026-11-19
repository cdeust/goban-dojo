# Étude des parties de Shūsaku

- [x] Préparer un index des captures, ataris et connexions à partir des kifus.
- [x] Ajouter la comparaison avant/après, les repères sur le goban et l’accès aux variantes.
- [x] Vérifier les règles, les parcours de lecture et le rendu sur ordinateur et mobile.

## Vérification

L’index contient 24 998 positions dans 465 des 469 parties. La liste des coups de capture
correspond à celle obtenue avec `buildTimeline().capturesAt` pour chaque partie du corpus.

Mesure locale sous Node 26.11.1, dans un seul processus, sans base de données. Cinq passages
sur le premier kifu (`s001`) donnent les mêmes 52 numéros de coup avec `studyMoves` et avec
`threatOf` appelé pour chaque coup. Médiane mesurée avec `performance.now()` autour de chaque
appel complet : 0,47 ms pour l’index en une passe, 22,07 ms pour les relectures répétées.

Le build, le typage, le lint, les frontières de dépendances, le formatage et les 98 tests
unitaires passent. La suite Chromium complète a validé 12 parcours avant la retouche mobile.
Le test de non-régression mesure 370 px de débordement interne avec l’ancien build. Les deux
parcours mobiles passent sur le build corrigé, avec 0 px de débordement interne du panneau.
Les captures à 1 440 × 900 et 390 × 844 confirment la disposition du goban et de l’explication.

Le registre officiel est configuré dans npm et pnpm. La résolution DNS du registre échoue
dans le bac à sable. Avec l’accès réseau autorisé, `npm ping` reçoit un `PONG` et la recherche
`modern-web-guidance` aboutit avec le cache npm sur le volume Anthropic.

## Temps de réflexion

- [x] Vérifier les interruptions historiques et le contenu des champs temporels SGF.
- [x] Monter trois scènes, avec les suites historiques et des variantes distinctement signalées.
- [x] Vérifier la légalité des coups, le parcours dans Chromium et les effets.

Les deux interruptions de séance sont confirmées par le commentaire de Miyamoto Naoki,
et les trois dates figurent dans le SGF CWI 126. Les SGF CWI et PGD ne contiennent aucun
champ de temps restant par coup. Les sept suites de trois coups sont légales.

Le build et les 99 tests unitaires passent. Les cinq parcours Chromium ciblés passent,
dont le retour au kifu, la réduction des mouvements et l’apparition des éclairs à K11.

## Analyse interactive des variantes

- [x] Vérifier les sorties du réseau et la distinction entre politique brute et recherche.
- [x] Relier le balayage progressif, les repères du goban et la navigation de branche.
- [x] Mesurer les délais et vérifier le parcours Chromium avec le vrai modèle.

Avant ce changement, la réflexion proposait uniquement les lignes éditoriales. Depuis la
position après Blanc 126, le balayage propose 12 premiers coups, chacun avec 12 réponses.
Le test Chromium du build final, seul dans son worker, mesure 1,12 s avant les premières
propositions et 1,92 s jusqu’aux 144 suites, chargement compris. K11 est classé 36e et reste
disponible comme coup de référence. Le build, les 100 tests unitaires et le parcours de
navigation jusqu’à la réponse du kifu et retour au départ passent.

## Lecture longue des plans

- [x] Rendre la projection du moteur progressive et les points de bifurcation jouables.
- [x] Afficher les réponses tactiques et l’évolution de l’avance dans le goban de réflexion.
- [x] Vérifier les règles, la durée de calcul et la navigation sur une vraie partie.

Le build final et les 101 tests unitaires passent. Quatre parcours Chromium ciblés
passent, dont l’ouverture avant Noir 127, l’affichage des territoires estimés, la
bifurcation et la restauration de la branche. Après démarrage du calcul sur K11, le
premier coup apparaît en 0,81 s et les 60 coups sont disponibles en 13,77 s.

Depuis la position initiale de la partie s126, une mesure en Node avec le modèle ONNX
livré et WASM sur un seul fil donne 240 coups en 53,57 s, pour 1 201 inférences. La
relecture par le moteur de règles ne trouve aucun coup illégal. Chaque position
calculée comporte 361 valeurs de propriété finies, comprises entre −1 et +1.

## Références de mise en scène

- [x] Examiner des scènes de jeu de _Hikaru no Go_ et rejouer la lecture de K11 sur le site publié.

Dans [l’épisode 3, vers 19:20–20:20](https://archive.org/details/HNGjpAudio), le montage
alterne main, regard et goban, puis isole le contact de la pierre. Dans l’épisode 56,
vers 5:10–6:15 et 13:20–15:20, il passe du plateau informatique à un goban éclairé en
bleu sur fond noir. Les gros plans rendent aux pierres leur place dans l’action.

Sur le site publié (`56dfcef`), la projection lancée avant Noir 127 dans la partie du
11 septembre 1846 atteint bien 60 coups. À 1 440 × 900, elle conserve le même cadrage
et sollicite plusieurs commandes avant de montrer une suite. Le graphe commence
en bas de la fenêtre. Cas à reprendre pour la mise en scène : isoler la menace sur
le goban, jouer une branche jusqu’à sa conséquence tactique, revenir à la position
du kifu et révéler K11.

## Pauses tactiques dans le replay

- [x] Repérer les captures de plusieurs pierres, les ataris de groupe et les coups
      qui relient des groupes tout en attaquant.
- [x] Suspendre la lecture avant chaque coup retenu et afficher les pierres concernées.
- [x] Vérifier les 469 kifus et la légalité des défenses fournies.

Une passe sur le corpus de 85 577 coups indexe 3 728 scènes (dont trois entrées
historiques), dans 406 parties. Parmi les scènes tactiques, 1 264 permettent
d’essayer immédiatement une autre défense légale. L’index du corpus prend 136 ms
dans un processus Node local, hors calcul des variantes.

## Séquence de réflexion sur le goban

- [x] Projeter les effets d’impact sur la grille réelle.
- [x] Lire plusieurs branches sur un mini-goban, puis reprendre le kifu.
- [x] Vérifier le parcours, les deux couleurs et la réduction des animations.

Dans la partie du 24 décembre 1839, le mini-goban montre trois branches avant
Noir 87. La première apparaît en 940 ms lors du parcours Chromium local, à partir
de l’affichage de la scène. Le replay pose F7 sur le goban principal, puis ouvre
une nouvelle simulation avant Blanc 88, G7. Le test de règles rejoue les 24 coups
proposés sur une position du corpus sans relever de coup illégal. Le rendu a
également été vérifié à 1 440 × 900 et 390 × 844.

## Atelier de go et import SGF

- [x] Afficher les variantes sur le goban principal.
- [x] Importer et conserver les kifus dans la bibliothèque locale.
- [x] Rejouer, étudier et deviner avec les joueurs du kifu.
- [x] Vérifier les règles, les importations et le rendu.

L’import a été vérifié avec un fichier SGF 19 × 19, un komi de 6,5 et deux noms de
joueurs. Le test Chromium retrouve la partie après rechargement et lance
l’exercice avec Blanc. Les tests de règles couvrent le handicap, la passe, la
première variante SGF et les fichiers incompatibles. Pendant une simulation,
Chromium mesure les mêmes dimensions et la même position pour le canvas du goban.

## Fondu du salon pendant l’estimation

- [x] Assombrir le décor dans la scène 3D et rétablir ses couleurs au retour au kifu.
- [x] Vérifier le plateau, le fondu et le retour en lecture.

Vérification Chromium à 1 440 × 900 et 390 × 844 : le même canvas reste en place
avant et pendant le fondu, puis le décor reprend sa luminosité. Sur la capture
desktop, la luma moyenne du rectangle de tatami (90 × 36 px, origine 50, 90 sur la
capture redimensionnée à 1 000 px de large) passe de 132,1 à 42,2 puis revient à
132,1 (FFmpeg, YAVG).

## Teinte des pierres pendant l’estimation

- [x] Appliquer une teinte froide distincte à chaque camp pendant l’estimation.
- [x] Vérifier le rendu et le retour aux couleurs du kifu.

Vérification sur Chromium à 1 440 × 900 et 390 × 844. Moyennes RVB sur deux
pierres fixes (carrés de 4 px à 498, 304 et 544, 303 sur la capture desktop
à 1 000 px de large). La pierre noire passe de (50, 42, 34) à (54, 54, 62).
La pierre blanche passe de (231, 227, 218) à (215, 217, 218). Les valeurs
initiales reviennent après la pose du coup du kifu.
