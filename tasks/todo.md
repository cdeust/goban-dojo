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
