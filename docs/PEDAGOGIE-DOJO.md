# Du premier coup à la lecture d'une partie

## Décision pédagogique

Un exercice de capture n'est pas une leçon de stratégie. La progression doit faire alterner explication d'un principe, observation de sa mise en œuvre dans un vrai kifu, décision du joueur, lecture de la réponse et transfert vers une autre position inconnue. Un joueur doit pouvoir comprendre pourquoi un coup est raisonnable dans cette position, puis comparer ses conséquences, même lorsque le moteur préfère une autre ligne.

L'[exemple de cursus de la Nihon Ki-in](https://www.nihonkiin.or.jp/teach/school_teach/digest/11.html) introduit très tôt l'ouverture, le milieu de partie et la fin de partie, parallèlement aux règles, à la lecture tactique et au territoire. Son [cours sur le premier coup](https://www.nihonkiin.or.jp/teach/lesson/school/joban01.html) introduit l'exploitation de la troisième et quatrième ligne dans les coins. Ces contenus servent de référence pédagogique, ils ne sont pas reproduits dans le produit.

## Compétences à relier

| Fil conducteur             | Ce que l'apprenti doit pouvoir expliquer                                        | Preuve observable et évaluation                                                       |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Premier coup et fuseki     | Pourquoi développer un coin plutôt que mémoriser une coordonnée                 | Repérer les secteurs libres, comparer plusieurs développements légaux                 |
| Approche et réponse        | Comment répondre à une approche, prolonger une forme ou choisir ailleurs        | Rejouer la suite du kifu, distinguer structure locale et décision globale             |
| Construire une structure   | Libertés, connexions, coupures, espace de base et efficacité des pierres        | Lire les chaînes, vérifier une conséquence locale, comparer une autre direction       |
| Transition vers le milieu  | Repérer les groupes dont la sécurité est incertaine et identifier les priorités | Comparer des positions avant/après les échanges, tester les suites adverses           |
| Combat et décision globale | Reconnaître un enjeu local sans perdre la priorité du goban entier              | Tsumego prouvé ou comparaison moteur à budget comparable, puis choix en partie réelle |
| Yose et bilan              | Comprendre la valeur d'un échange, le décompte et ce qui reste à jouer          | Vérifier les captures et le territoire avec règles et hypothèses définies             |

L'explication ne doit jamais inventer la cause d'une préférence de l'IA. Une suite du kifu est un exemple attesté ; une variante générée est une hypothèse ; une preuve de règles est contrôlable indépendamment. Une évaluation moteur à budget donné est une estimation et non une vérité universelle.

## Évaluation et grades

La [FFG](https://ffg.jeudego.org/echelle/echelle_algo.php) calcule son échelle à partir de résultats de parties et de paramètres de compétition ; l'[EGF](https://www.eurogofed.org/egf/rating-system-commission/) maintient également un système de classement fondé sur les résultats. La trajectoire kyu → dan est donc un objectif d'apprentissage. Le dojo ne revendique pas de grade officiel, de certificat, ni de calibration humaine tant que celle-ci n'a pas été mesurée.

- Évaluer le **transfert** sur des positions distinctes des exercices guidés et sans aide visible ; une réussite répétée sur le même kifu ne constitue pas une preuve nouvelle.
- Mesurer séparément le **profil par compétence**, la rétention différée, l'aisance sur des variantes et les résultats de parties complètes. La gamification et l'XP restent des mesures d'activité.
- Une proposition de niveau doit être accompagnée d'éléments observés et de limites explicites. Une confirmation au niveau suivant nécessite plusieurs observations indépendantes. Ne pas déduire un rang kyu/dan d'un nombre de visites Leela/KataGo.
- Avant d'afficher des estimations de force comparables aux rangs humains, calibrer contre des joueurs classés consentants sur positions inconnues et parties complètes ; mesurer l'erreur absolue par tranche, les faux passages et la stabilité après réévaluation. Publier les tailles d'échantillon et l'incertitude. Aucun rang compétitif ne doit être présenté comme certifié uniquement par un frontend.

## Mesures à suivre dans le pilote

1. Pour chaque compétence, nombre de positions distinctes réussies sans aide / nombre évalué, en distinguant la découverte et la révision.
2. Taux de réussite sans aide sur une position inconnue après une leçon (objectif : amélioration par rapport au test avant la leçon), et rétention à J+7.
3. Évolution du profil sur les examens de placement et de promotion ; absence de double-crédit sur une même réponse.
4. Taux de parcours achevés, positions réellement travaillées, abandons, réussite de la synchronisation et poursuite de la pratique sur mobile.

Les mesures humaines ci-dessus restent à collecter ; ne pas les inventer ni confondre les tests logiciels avec une preuve d'efficacité pédagogique. Pas d'analytics utilisateurs centralisés sans décision sur la confidentialité.
