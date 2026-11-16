# Modèle de menaces (STRIDE)

## Système

Site **statique** : HTML, CSS, JavaScript et un fichier `games.json`, servis depuis une seule
origine. Pas de serveur applicatif, pas de compte, pas de formulaire transmis, pas de cookie, pas
de stockage local, pas de télémétrie, aucune donnée personnelle. Les seules entrées de
l’utilisateur sont des clics, des touches et un champ de recherche filtré en mémoire.

Frontières de confiance :

1. **Amont des données** — les SGF d’un dépôt tiers, lus par le pipeline de construction.
2. **Chaîne d’approvisionnement** — paquets npm et actions GitHub.
3. **Navigateur** — le code livré et `games.json`, face au réseau et à l’hébergeur.

## Menaces et mesures

| STRIDE                     | Menace                                                   | Mesure                                                                                                                                                                                    | Vérification                                                |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **S**poofing               | Un SGF amont remplacé par un autre contenu               | Commit épinglé ; chaque fichier nommé et revérifié par son empreinte git                                                                                                                  | `tests/dataset.test.ts`, `pnpm data:fetch`                  |
| **T**ampering              | Paquet npm compromis ou version glissante                | Versions exactes, `pnpm-lock.yaml` avec empreintes, `--frozen-lockfile --ignore-scripts` en CI, Dependabot, SBOM                                                                          | CI, `pnpm audit`, `pnpm sbom`                               |
| **T**ampering              | Action GitHub détournée (étiquette déplacée)             | Actions épinglées par SHA de commit ; `permissions: contents: read` ; `persist-credentials: false`                                                                                        | revue des workflows                                         |
| **T**ampering              | Injection de script dans la page                         | CSP `default-src 'none'; script-src 'self'`, sans `unsafe-eval` ni script en ligne ; React échappe tout texte ; aucun `dangerouslySetInnerHTML` ; `base-uri 'none'`, `form-action 'none'` | `e2e/app.spec.ts` injecte un script et constate son blocage |
| **T**ampering              | `games.json` altéré provoquant un comportement inattendu | Validation de forme avant usage (`isDataset`) ; coordonnées bornées au goban ; les données ne sont jamais interprétées comme du code ou du HTML                                           | `tests/board.test.ts`                                       |
| **R**epudiation            | Origine d’une partie invérifiable                        | Chaque partie garde ses chemins source ; rapport de construction versionné ; CI qui échoue si les données régénérées diffèrent                                                            | étape « git diff » de la CI                                 |
| **I**nformation disclosure | Fuite vers des tiers (polices, CDN, référent)            | Aucune requête hors origine : polices auto-hébergées, textures et sons procéduraux, `connect-src 'self'`, `referrer: no-referrer`, liens externes en `noopener noreferrer`                | `e2e` échoue à la moindre requête sortante                  |
| **D**enial of service      | SGF hostile (géant, profondément imbriqué)               | Taille plafonnée à 512 Ko ; analyseur itératif, sans récursion ni expression régulière à retour arrière                                                                                   | `tests/sgf.test.ts` (20 000 niveaux, 30 000 coups)          |
| **D**enial of service      | Navigateur saturé par le rendu                           | Instanciation (3 appels de dessin pour toutes les pierres), rendu à la demande après l’ouverture, densité de pixels plafonnée à 2                                                         | mesure manuelle                                             |
| **E**levation of privilege | Jeton CI trop puissant                                   | Jeton en lecture seule ; écriture limitée au seul travail de publication, déclenché à la main                                                                                             | workflows                                                   |

## Hors périmètre, à la charge de l’hébergeur

- En-têtes HTTP : la CSP est posée par balise `<meta>`, qui ne peut pas exprimer
  `frame-ancestors`. Un hébergeur devrait ajouter `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff` et HSTS. GitHub Pages ne permet pas d’en-têtes personnalisés.
- `style-src` autorise `'unsafe-inline'` : React et Motion posent des styles en ligne. Le risque
  résiduel est une injection de style, sans exécution de code.

## Données sensibles

Aucune. Le pilier « sécurité d’infrastructure » (cloisonnement réseau, RBAC, comité d’éthique)
est sans objet : le projet ne traite que des parties de go du XIXᵉ siècle et des faits
biographiques publiés.
