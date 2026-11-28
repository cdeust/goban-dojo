# École de go : cursus et preuves

## Décision du 27 novembre 2026

Le produit doit être une véritable école de go, et non un ensemble de quelques devinettes. Le corpus de référence du dépôt contient 469 parties effectivement rejouables, avec 85 577 coups, issus du fonds Shūsaku de CWI. Le catalogue d'école utilise uniquement des positions réellement enregistrées ; une variante calculée est signalée comme telle. Chaque exercice indique le numéro de coup, les joueurs, la date, le fichier SGF source et permet le retour au kifu. Le score d'un modèle n'est pas un verdict de règles.

### Référentiels

- [Nihon Ki-in, exemple de cursus de formation](https://www.nihonkiin.or.jp/teach/school_teach/digest/11.html) et [initiation officielle](https://www.nihonkiin.or.jp/teach/lesson/school/) : progression des règles vers la lecture tactique, la stratégie et le jeu complet ; petits gobans pour commencer avant le 19×19. Ce n'est pas une affiliation ni une équivalence automatique de grade.
- [FFG, méthode d'initiation de Fan Hui](https://ffg.jeudego.org/informations/goscolaire/documents/Methode_atari-go.pdf) : faire jouer tôt, apprendre les gestes par la pratique, ne pas ensevelir les débutants sous le vocabulaire.
- [EGF, présentation de Pandanet Beginners Academy](https://www.eurogofed.org/introducing-the-pandanet-go-beginners-academy/) : associer exercices, évaluations de niveau et situations de partie. [EGF Academy](https://www.eurogofed.org/egfacademy/) : alterner cours, problèmes, parties et relecture des parties.
- [Butler et al. 2017](https://pubmed.ncbi.nlm.nih.gov/29265856/) : utiliser des exemples variés pour tester le transfert. Les expériences portent sur l’enseignement de concepts en géologie ; application au go à vérifier par le pilote.

## Cursus disponible et preuves (pas une promesse de rang officiel)

| Niveau               | Compétence                                                                        |      Exercices |
| -------------------- | --------------------------------------------------------------------------------- | -------------: |
| 1 – Fondations       | Libertés, capture d’une pierre, capture d’une chaîne                              |             72 |
| 2 – Combat local     | Sortie de l’atari, connexion, atari                                               |             72 |
| 3 – Lecture tactique | Double atari, capture forcée en trois demi-coups, ko et suicide                   |             72 |
| 4 – Territoire       | Couleur de la frontière, dénombrement d’une région fermée                         |             48 |
| 5 – Vie et mort      | Reconnaître et former deux yeux sûrs, démasquer un faux œil                       |             72 |
| 6 – Tesuji           | Uttegaeshi (sacrifice et reprise), semeai (course de libertés), shichō (escalier) |             72 |
| 7 – Ouverture        | Fuseki, aborder un coin, lire les échanges du coin, direction de jeu              |             48 |
| 8 – Stratégie        | Influence, réduction ou invasion, initiative                                      |             36 |
| 9 – Yose et décompte | Captures tardives, prisonniers, frontière, variation géométrique, points japonais |            160 |
| Cycle d’application  | Partie 19×19 contre Leela Zero, sauvegarde/historique, analyse KataGo des coups   | Pratique libre |

**748 exercices et études, 37 chapitres, 168 parties historiques de 1839 à 1861.** L'ensemble initial de 264 est conservé ; 144 exercices tactiques avancés, 84 études stratégiques, 96 études intermédiaires d’ouverture et de transition, et 160 exercices de yose sont ajoutés. `pnpm data:build` régénère les quatre fichiers de catalogue. Aucune composition, transformation ou variation de la mise en place ne gonfle le catalogue. Une même position peut servir à deux compétences distinctes. Chaque activité est ancrée dans un préfixe exact de kifu et un identifiant stable. Les différences entre coup réel et variante sont affichées.

### Validité des objectifs

- Fondations : les règles vérifient les alternatives, les choix légaux et les captures. Les 24 captures forcées testent chaque défense légale (passe comprise) à horizon trois demi-coups en ko simple.
- Vie et mort : le certificat de deux yeux d'une intersection est suffisant pour une chaîne connectée, jamais une preuve de mort en son absence. Faux œil : capture légale avec une autre chaîne adverse survivante. Semeai : objectif immédiat de sauver sa chaîne et capturer l'autre. Uttegaeshi : variante conditionnelle à une capture adverse possible, pas forcée. Shichō : preuve bornée de capture à horizon neuf demi-coups, attaquant limité aux ataris directs, toutes réponses défensives légales examinées ; le joueur choisit l'initiation et peut rejouer la preuve numérotée. Ce n'est ni un solveur universel de vie/mort ni une classification du seki. Le filet (geta) et des lectures plus longues restent des spécialisations à enrichir.
- Stratégie : 180 cas sur des faits géométriques du kifu ; les hypothèses alternatives sont des coups joués plus tard par le même camp, légaux au préfixe d'origine. Comparaison réelle KataGo de positions sœurs à un horizon identique, avec incertitude moyenne d'environ deux points ; ni vérité sur le meilleur coup, ni classification exhaustive des joseki. Le joueur peut choisir un autre coup légal et lire ses suites au dojo. Voir [STRATEGY-COURSE.md](STRATEGY-COURSE.md).
- Yose : les 160 questions exploitent les captures réelles, le compteur de prisonniers et des comparaisons géométriques avant/après. L'atelier japonais permet de marquer les groupes convenus morts ou en seki et de fournir un komi explicite ; il fait un calcul conditionnel, refuse une adjudication impossible et ne prétend pas reproduire le résultat historique quand l'accord ou le komi est absent. Voir [ENDGAME-COURSE.md](ENDGAME-COURSE.md).
- Partie d'application : vraie partie 19×19 contre Leela Zero, choix du camp et budgets 8/32/64 visites, règles chinoises de surface avec superko positionnel, double passe et adjudication explicite, abandon. Sauvegarde du kifu numéroté et historique, analyse des coups du joueur par KataGo (estimateur comparatif en règles japonaises, pas le résultat chinois de la partie). Aucun niveau kyu/dan garanti. Voir [TRAINING-GAME.md](TRAINING-GAME.md).

Les petits gobans 9×9 et 13×13 recommandés par Nihon Ki-in nécessitent encore un modèle et des règles adaptées ; pour l'initiation actuelle, la vue locale cadre le vrai goban 19×19 sans en modifier les pierres. La calibration d'un adversaire humain simulé, la validation avec une école de go restent des objectifs de produit. La revue de partie propose déjà un chapitre à partir de différences observables (captures, secours, connexions, atari, ou phase de partie), sans prétendre identifier une causalité du verdict IA.

## Progression et portabilité

Le joueur choisit librement un module ; la recommandation priorise ses rappels dus, puis les exercices encore inconnus du niveau courant selon ses résultats. L'objectif initial de chaque chapitre est la moitié des exercices disponibles, plafonnée à 12 réussites sans aide au dernier rappel. Pour les études stratégiques, la réussite indique un coup dans la marge d'incertitude du moteur, pas une preuve de règle. La première réussite sans aide est conservée séparément, même après une révision ultérieure. Un premier échec ou indice est enregistré immédiatement : quitter la séance ne le transforme pas en réussite au premier essai. Il s'agit d'un signal de transfert et non d'un grade. Les révisions suivent les intervalles 1, 3, 7, 14, 30 jours et ne récompensent pas la répétition artificielle avant échéance.

Le carnet réunit les recommandations de l’école et les rappels de kifu sans confondre le score d’apprentissage avec la reconnaissance d’une position historique. Les résultats ont deux historiques distincts. Les résultats sont synchronisés par compte ; les visiteurs ne conservent aucune progression après rechargement. Les comptes peuvent aussi exporter leur progression scolaire en JSON versionné. Une importation doit être valide et correspondre au catalogue ; remplacement uniquement après confirmation explicite. Une sauvegarde invalide ne modifie pas le profil. L'export scolaire ne contient pas de SGF, de parties d'entraînement ni l'ancien Carnet ; un export unifié est sur la feuille de route. Voir [Comptes Supabase](ACCOUNTS.md) pour la configuration de la synchronisation authentifiée entre appareils.

## Sources supplémentaires à évaluer

L'[archive des championnats européens](https://eurogofed.org/archives/egc/en/stats/games/) expose des parties réelles récentes et historiques, dont les fichiers SGF ; les [parties AlphaGo de Google DeepMind](https://deepmind.google/blog/alphagos-next-move/) sont des pistes de comparaison pédagogique. Ne pas importer ni republier un nouveau fonds sans vérifier la provenance, les termes de réutilisation des fichiers et annotations, et les droits commerciaux. Le corpus CWI/PGD déjà dans le dépôt ne déclare pas de licence ; voir DONNEES.md. Le stade actuel est gratuit. Aucun contenu d'une école tierce n'est copié.

Le catalogue est chargé à la demande depuis le carnet ou l’école ; il reste séparé du chargement initial du kifu. Voir [la pédagogie et les mesures du dojo](PEDAGOGIE-DOJO.md).
