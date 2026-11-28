# Le Sensei : comparaison et preuves

Le dojo sépare la proposition de l'IA, la vérification des règles et l'estimation du score. Le lecteur ne déduit ni la vie d'une chaîne de son nombre de libertés, ni le territoire du nombre de coins occupés. La décision de l'élève reste distincte de la suite historique et des hypothèses calculées.

## Lecture guidée de l'ouverture

Après le choix de l'élève, le Sensei compare son coup à un deuxième candidat légal (meilleur candidat évalué, kifu, ou autre candidat distinct). Les deux branches partent du même préfixe et sont lues jusqu'à cinq demi-coups, avec 32 visites de Leela Zero nº 116 à chaque réponse. Les coups sont contrôlés indépendamment par le moteur de règles, avec superko positionnel pour ces variantes, avant d'être appliqués. Les deux branches peuvent être rejouées avec leurs numéros de coups. Elles n'imitent pas obligatoirement le kifu ni le futur jeu humain.

Le domaine mesure les chaînes distinctes, les chaînes à une ou deux libertés et les secteurs de coin occupés, ainsi que les libertés du groupe du premier coup s'il subsiste. Ces mesures sont des propriétés locales, non des preuves de vie ou d'influence. KataGo b10c128 compare l'estimation du score au dernier coup de chaque branche ; si une branche se termine par deux passes avant l'autre, aucune différence de score à horizons inégaux n'est présentée comme un classement. Les écarts de moins de deux points sont dans la marge d'incertitude approximative mesurée sur le moteur (voir [MOTEUR.md](MOTEUR.md)). La lecture reste facultative, annulable, sans attribution d'XP.

**Métriques de vérification :** deux candidats distincts, 100 % des coups de variante légaux ou interruption explicite, 32 visites par réponse complète, même horizon pour les comparaisons, zéro évaluation de ligne incomplète, numéros exacts. Tests de domaine et E2E Chromium mobile sur les deux moteurs réels ; en cas de panne, aucune suite factice n'est affichée. L'efficacité pédagogique (transfert vers une ouverture inconnue et rétention) nécessitera un pilote.

## Benchmark professionnel reproductible

Partie 1 du 80e Honinbo, le 14 mai 2025 : Noir Shibano Toramaru, Blanc Ichiriki Ryō, tous deux 9e dan professionnel, komi 6,5, victoire de Blanc par abandon. [Résultat officiel Nihon Ki-in](https://www.nihonkiin.or.jp/match/honinbo/archive.html) · [Kifu CWI](https://homepages.cwi.nl/~aeb/go/games/games/Honinbo/Title/Hon-2025-1.sgf).

Le 28 novembre 2026, les 152 coups ont été **effectivement évalués** dans Chromium/ONNX Runtime sur le code `c5583a8219c692667f3b4c9c1beb39aa28add979`. Pour chaque position, on rejoue le préfixe du véritable kifu, puis Leela Zero propose le premier candidat légal le plus visité (32 simulations PUCT, même méthode que le mode partie). KataGo, réseau distinct, estime le score des deux positions immédiatement après le coup. La différence est signée pour le joueur au trait. Le modèle Leela Zero utilise son komi interne d'entraînement 7,5 tandis que KataGo reçoit le komi réel 6,5. Temps mesuré : 234 secondes sur le Mac de test.

| Mesure                                     |                    Résultat |
| ------------------------------------------ | --------------------------: |
| Positions étudiées                         |                     152/152 |
| Coups identiques                           |                 77 (50,7 %) |
| Écart estimé ≥ +2 points                   |                           9 |
| Écart estimé ≤ −2 points                   |                           7 |
| Écart absolu < 2 points, identiques inclus |                136 (89,5 %) |
| Écart moyen, toutes positions              |                   +0,304 pt |
| Écart moyen de probabilité de victoire     | +0,877 point de pourcentage |

Exemple de gain estimé : Noir 143, S12 plutôt que O14 (+10,82 pt). Exemple inverse : Noir 63, C11 plutôt que F16 (−4,86 pt). Les deux sont préservés dans les [152 lignes de mesure](benchmarks/hon-2025-1.ndjson). L'empreinte SHA-256 du fichier est `e66c962ad6cd76369d732b4911dcfe0911c38f76a706fee67bd8cef67048740d`. Un test recalcule chaque agrégat de l'interface à partir de ce fichier.

### Réexécuter

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
curl -fL https://homepages.cwi.nl/~aeb/go/games/games/Honinbo/Title/Hon-2025-1.sgf -o /tmp/hon-2025-1.sgf
shasum -a 256 /tmp/hon-2025-1.sgf
# 6bb719a90b792eadef7236d859e86ff7265f56af35c71a1445172888927463a5
node scripts/dev/benchmark-pro.ts /tmp/hon-2025-1.sgf /tmp/hon-2025-1-nouveau.ndjson 32
```

Une seconde exécution intégrale du script après son intégration a reproduit les 152 lignes à l’identique, hors temps de calcul (269 secondes durant les autres tests locaux).

Le script utilise les vrais workers, un serveur local temporaire sur 127.0.0.1 et le parseur SGF du projet. Les modèles sont contrôlés par leur empreinte avant utilisation. Le fichier de sortie ne remplace pas un résultat existant ; on peut limiter le nombre de coups avec un quatrième argument pour un contrôle rapide. Les empreintes des réseaux sont imprimées à l'exécution.

### Limites et suite de l'étalonnage

Une seule partie, des décisions corrélées, un évaluateur de petite taille sans recherche et un budget Leela limité ne démontrent pas une force de match, encore moins la supériorité systématique sur un 9e dan. Les écarts ne sont pas cumulables : le préfixe historique est remis à chaque mesure. La distribution des différences est un signal à reproduire sur plusieurs parties modernes, plusieurs budgets et un évaluateur indépendant plus puissant. Les épreuves kyū/dan sont des jalons pédagogiques jusqu'à validation sur des joueurs classés. Voir [EVALUATION-KYU-DAN.md](EVALUATION-KYU-DAN.md).

## Étude de transposition : deux véritables décisions

Le 24 mai et le 18 juillet 1843, Kadono Chūzaemon et Shūsaku échangent les couleurs et atteignent exactement le même plateau après six coups, en inversant l'ordre de deux coups de Noir. Dans le premier kifu (`s050`), Noir Kadono joue P16, puis les réponses sont C6, D6, D7, E6 ; dans le second (`s052`), Noir Shūsaku joue D5, puis P17, F4, G3, C11. Les deux gagnent Noir par abandon : aucune causalité du coup 7 n'en découle. Les deux séries sont directement rejouables avec leur numérotation d'origine, et le Sensei permet une simulation à partir du même préfixe pour confronter les choix à des réponses calculées. Le test vérifie l'identité exacte des plateaux et le contenu des deux séries de coups, pas une simple ressemblance.

[Kifu du 24 mai](https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/050.sgf) · [Kifu du 18 juillet](https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/052.sgf). Les deux parties sont exclues de la banque d'épreuves. Une vérification des positions sous les huit symétries du goban empêche aussi le partage d'une forme identique entre cursus et examen, même si la partie est différente. Voir [Évaluation kyū/dan](EVALUATION-KYU-DAN.md).
