# Comptes et progression synchronisée

## Décision

Supabase Auth (e-mail et mot de passe), Postgres et Data API. Le site statique reste hébergé sur GitHub Pages ; aucune clé privilégiée dans le navigateur. Aucun compte anonyme Supabase : un visiteur a seulement une session en mémoire, sans progression, partie, carnet ou import SGF durable. La préférence d'affichage des numéros est distincte de la progression.

Objectifs mesurables :

- Un utilisateur retrouve sa progression, ses révisions, les parties et analyses sauvegardées dans un autre navigateur après connexion.
- Zéro enregistrement durable de progression pour le visiteur après rechargement ; pas de transfert automatique du visiteur vers un compte.
- Zéro accès inter-comptes : politiques RLS par propriétaire, y compris la lecture, l'écriture et la suppression ; rôle anonyme sans accès aux tables privées.
- Une écriture non confirmée par le serveur n'est jamais présentée comme sauvegardée. Une modification concurrente n'écrase pas silencieusement une progression plus récente.

## Frontière des données

Trois couches : les calculs de progression et règles de go restent purs ; un dépôt de session dans `state` expose un cache mémoire de données validées ; l'adaptateur Supabase est l'unique frontière réseau d'authentification et de persistance. L'interface ne connaît pas les clés ni les requêtes SQL. La session charge ses données avant d'afficher son carnet.

Chaque espace (`school`, `practice`, `training`, `history`, `imports`) porte une version de format validée par les décodeurs existants. Les écritures sont sérialisées et utilisent une révision attendue afin de refuser un conflit multi-appareils. L'utilisateur doit être informé d'un conflit et pouvoir récupérer sa session sans perte. À la déconnexion : attendre les écritures en cours, vider les données mémoire, ne jamais réattribuer une progression à un autre compte.

La migration des données locales existantes est explicite et facultative après connexion ; aucun import automatique ni effacement avant confirmation serveur. Ne conserver que le jeton de session selon le mécanisme officiel Supabase, et les réglages non personnels nécessaires à l'interface.

## Configuration et hébergement

Variables de build publiques : URL exacte du projet Supabase et clé publishable. Restreindre `connect-src` de la CSP à l'origine du projet configuré. Pas de wildcard pour les hébergeurs Supabase, de secret ou de service role dans Vite. Confirmation de l'adresse électronique par le service Auth et lien de récupération du mot de passe borné au domaine du dojo. Prévoir suppression du compte et export de ses données avant ouverture commerciale. Aucun projet de production ni changement de plan sans autorisation de Clément.

## Validation attendue

Deux comptes de test isolés, session visiteur, nouvelle session navigateur et synchronisation ; inscription, confirmation, connexion, récupération et déconnexion ; test de concurrence et de panne réseau ; tests SQL des politiques de propriété sur base isolée. Les tests E2E de persistance locale actuels devront être conservés sous forme de scénarios de compte et complétés par les scénarios visiteurs. Ne pas les simplement supprimer.

Sources officielles : [Auth par mot de passe](https://supabase.com/docs/guides/auth/passwords), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog.md), consultés le 27 novembre 2026.

## Tests et exploitation

Exécuter `pnpm dlx supabase@3.4.0 start -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` dans un environnement Docker de test dédié, puis `pnpm dlx supabase@3.4.0 test db` et `pnpm e2e:accounts`. Le script de test utilise uniquement l'instance loopback et refuse toute URL distante. `pnpm e2e` vérifie le parcours visiteur sans configuration Supabase. Pour une production, configurer les deux variables du dépôt GitHub et reproduire les réglages Auth du projet local, sans jamais importer la clé privée. La configuration distante n'est pas incluse dans cette PR. Le workflow de publication refuse de construire une version publique si les variables de compte sont absentes, afin de conserver le déploiement précédent plutôt que de perdre la sauvegarde des utilisateurs.

Le stockage actuel utilise cinq espaces de progression versionnés, plafonnés à 8 Mio par espace. Avant ouverture commerciale à grande échelle, mesurer la volumétrie et déplacer les archives longues vers des lignes par partie, ainsi que les événements d'apprentissage vers des enregistrements incrémentaux.

### Mise en service publique (non effectuée)

- Créer ou sélectionner un projet Supabase dédié, appliquer la migration, désactiver les comptes anonymes, imposer la confirmation des adresses et les paramètres mots de passe documentés ici.
- Configurer `Site URL` et l'autorisation de redirection sur l'URL de production effective du dojo, incluant `/goban-dojo/` sur GitHub Pages, puis ajouter les deux variables publiques du dépôt. Ne jamais ajouter de clé de service au frontend.
- Le service SMTP hébergé par défaut de Supabase est réservé aux adresses de l'équipe du projet : configurer un SMTP personnalisé avant de proposer l'inscription au public. Valider réellement confirmation et récupération avec une adresse de test externe autorisée. Le test local Mailpit vérifie le parcours fonctionnel sans envoyer de mail externe ; il ne prouve pas la délivrabilité en production.
- Vérifier les limites du plan, l'emplacement des données, la politique de confidentialité, la suppression du compte et l'export de données avant toute commercialisation. La réinitialisation PKCE dans le client statique doit être effectuée sur le navigateur qui a demandé le lien.

Sources officielles : [SMTP personnalisé](https://supabase.com/docs/guides/auth/auth-smtp), [tests des parcours Auth](https://supabase.com/docs/guides/auth/testing-auth-flows), [exposition des tables à la Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
