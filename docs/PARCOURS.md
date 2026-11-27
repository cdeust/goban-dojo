# Parcours individualisé du dojo

Ce document décrit le premier incrément. Le cursus actuel, élargi à 652 exercices et études, est décrit dans [ECOLE.md](ECOLE.md).

Le but est qu’un joueur apprenne effectivement le go, sache où progresser et retrouve son travail, indépendamment du nombre de parties visionnées.

## Palier initial : un carnet qui guide la séance

L’XP est un indicateur d’activité, pas un rang kyu/dan. La difficulté des exercices et leur maîtrise sont deux axes distincts. Le parcours propose quatre exercices vérifiés dans le corpus, deux par compétence et deux degrés de difficulté. Un exercice peut être réussi sans indice, aidé ou révélé. Le rappel sans indice élève le palier de mémoire ; un rappel aidé revient demain. Une position qui n’est pas encore due ne peut pas rapporter d’XP une seconde fois.

| Compétence          | Niveau 1 (geste)              | Niveau 2 (groupes)             |
| ------------------- | ----------------------------- | ------------------------------ |
| Libertés et capture | La dernière liberté (s001/84) | Capturer un groupe (s009/32)   |
| Connexion           | Relier pour sauver (s001/81)  | Réunir trois groupes (s002/22) |

L'ordre recommandé privilégie les rappels à échéance, puis les exercices non commencés du niveau le plus accessible. Tous restent librement accessibles. Les statuts reposent sur les cartes enregistrées et non sur un classement arbitraire, avec une progression de session visiteur ou synchronisée par compte. La première leçon historique reste accessible directement.

**Critères de vérification :** positions vérifiées avec les règles du domaine ; deux niveaux visibles ; retour au lendemain déclenche le rappel dû ; rechargement d’un profil ayant réussi un exercice présente un progrès de 1/4 et une recommandation différente d’un profil vierge. Ne pas confondre cet indicateur avec la rétention d’une cohorte ou le rang officiel.

## Prochains paliers (non implémentés)

1. Sauvegarde portable locale versionnée : carnet, réglages, SGF d’origine avec identifiants stables uniquement si l’utilisateur les inclut. Valider le fichier avant tout changement ; aucune perte sur une importation invalide. Métrique : 100 % des positions, résultats, dates et préférences restaurés entre profils de navigateur.
2. Tsumego originaux : état initial noir/blanc, couleur au trait, objectif précis, identité séparée du kifu, suite jouée numérotée. Commencer par deux captures forcées en trois demi-coups vérifiées exhaustivement sous ko simple. Les vraies preuves de tactique sont les règles et la recherche des défenses ; Leela Zero et KataGo complètent les explications. Les exercices doivent être rejouables au clavier et par toucher. Développer les thèmes (capture, connexion, évasion, tesuji, vie/mort), pas seulement des variations d’une même position. Les objectifs vie/mort et règles de ko/seki demandent validation spécifique.
3. Personnalisation : élargir progressivement les thèmes et niveaux en fonction de la réussite sans aide, des erreurs et de la mémorisation ; distinguer séance de révision et entraînement libre. Pilote volontaire avec activation après un exercice terminé, retour au jour 7, proportion et effectifs, inconnus distincts.
4. Compte et synchronisation entre appareils, si le pilote confirme le besoin : choix technique et commercial séparé. Conserver un mode autonome local et un mécanisme d’export. Pas de collecte centralisée d’activité ni de service payant dans le palier initial. GitHub Pages héberge le MVP gratuit, pas un SaaS commercial.
