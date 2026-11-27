# Partie d'entraînement 19 × 19

## Choix et objectifs mesurables

- Couvrir le cycle jeu → résultat → revue, pour une partie légale commencée sur un goban vide.
- Conserver 100 % des coups numérotés (les passes font également avancer la numérotation) et les évaluations déjà produites lors de la reprise locale.
- Refuser les coups illégaux du joueur et du moteur, y compris les répétitions de position.
- Conserver chaque partie terminée avec son historique, sans écraser la précédente lors d'une nouvelle partie.

## Règles et modèle

Goban 19 × 19, comptage chinois par surface, komi 7,5, suicide interdit, superko positionnel. Le choix du komi correspond à celui du réseau Leela Zero existant. Les deux passes successives déclenchent le comptage et non une déclaration de victoire automatique. Le joueur désigne explicitement les groupes morts ; l'adjudication reste sous sa responsabilité (en particulier les sekis et les positions non résolues). L'abandon du joueur désigne la couleur adverse comme gagnante.

Leela Zero choisit un coup issu de sa recherche PUCT à 8, 32 ou 64 visites (32 par défaut ; budget sauvegardé avec la partie) ; aucune prétention à un grade ou à un niveau garanti. L'échec du chargement ou de la recherche ne produit pas de coup synthétique. La revue des coups du joueur repose sur le réseau KataGo existant, sans recherche arborescente, comparant le coup choisi aux cinq candidats préférés du réseau parmi les coups légaux. L’encodeur KataGo utilise les règles japonaises (territoire), distinctes du comptage chinois de la partie. Les écarts estimés et les catégories sont ceux du jugement existant ; ce ne sont ni une preuve optimale ni une mesure de force absolue.

## Stockage

Le kifu, le résultat et les jugements obtenus sont enregistrés localement et validés à la relecture. La sauvegarde après chaque coup et jugement permet de reprendre une partie ou une revue sans recommencer. L'historique local conserve les parties terminées. Pas de compte, backend, synchronisation multi-appareils ni classement déduit artificiellement.

## Vérification

`pnpm exec vitest run tests/trainingGame.test.ts` : règles, captures et numéros, ko, suicide, passes, adjudication, abandon, validation du kifu sauvegardé, sélection d'un vrai candidat moteur et reprise explicite en cas d'échec. Les doubles du moteur dans les tests vérifient l'adaptateur, pas la force du réseau.

Smoke réellement exécuté sur Chromium mobile (393 × 690) : ouverture de l’école, choix du budget 8, coup D4, réponse Leela Zero, rechargement et reprise à deux coups, abandon, revue KataGo effective du coup D4, historique local présent.

La revue propose un exercice lié à une différence effectivement observée entre coup joué et candidat moteur (capture, sauvetage, connexion, atari), sinon au stade de la partie. La suggestion ne constitue pas une explication causale de la perte de points ; le parcours garde les résultats de l’exercice distincts du verdict moteur.
