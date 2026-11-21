# Modèle de menaces (STRIDE)

## Système

Le site statique sert le lecteur, les kifu historiques et les modèles depuis sa propre origine. Le navigateur conserve les SGF importés dans son stockage local. L’analyse et les réponses de Leela Zero sont calculées sur l’appareil.

Dans le parcours d’un mentor, une recherche volontaire transmet uniquement le nom saisi à Wikipédia en français ou en anglais. Le lecteur affiche la source et conserve localement l’extrait que l’utilisateur choisit.

Frontières de confiance :

1. **Amont des données** — les SGF d’un dépôt tiers, lus par le pipeline de construction.
2. **Chaîne d’approvisionnement** — paquets npm et actions GitHub.
3. **Navigateur** — le code livré, les kifu personnels et les biographies conservés localement.
4. **Wikipédia** — réponses publiques des API de recherche en français et en anglais.

## Menaces et mesures

| STRIDE                     | Menace                                                   | Mesure                                                                                                                                                                                    | Vérification                                                   |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **S**poofing               | Un SGF amont remplacé par un autre contenu               | Sources épinglées (SHA-256 de l’archive CWI, commit PGD) ; chaque fichier revérifié contre un manifeste d’empreintes ; un fichier hors manifeste fait échouer la construction             | `tests/dataset.test.ts`, `pnpm data:fetch`                     |
| **T**ampering              | Paquet npm compromis ou version glissante                | Versions exactes, `pnpm-lock.yaml` avec empreintes, `--frozen-lockfile --ignore-scripts` en CI, Dependabot, SBOM                                                                          | CI, `pnpm audit`, `pnpm sbom`                                  |
| **T**ampering              | Action GitHub détournée (étiquette déplacée)             | Actions épinglées par SHA de commit ; `permissions: contents: read` ; `persist-credentials: false`                                                                                        | revue des workflows                                            |
| **T**ampering              | Injection de script dans la page                         | CSP `default-src 'none'; script-src 'self'`, sans `unsafe-eval` ni script en ligne ; React échappe tout texte ; aucun `dangerouslySetInnerHTML` ; `base-uri 'none'`, `form-action 'none'` | `e2e/app.spec.ts` injecte un script et constate son blocage    |
| **T**ampering              | `games.json` altéré provoquant un comportement inattendu | Validation de forme avant usage (`isDataset`) ; coordonnées bornées au goban ; les données ne sont jamais interprétées comme du code ou du HTML                                           | `tests/board.test.ts`                                          |
| **R**epudiation            | Origine d’une partie invérifiable                        | Chaque partie garde ses chemins source ; rapport de construction versionné ; CI qui échoue si les données régénérées diffèrent                                                            | étape « git diff » de la CI                                    |
| **I**nformation disclosure | Fuite vers des tiers (polices, CDN, référent)            | Ressources servies depuis le site. Seule la recherche biographique demandée par le joueur interroge les API Wikipédia prévues par la CSP. Politique `no-referrer`.                        | Contrôles CSP et réseau dans `e2e`                             |
| **D**enial of service      | SGF hostile (géant, profondément imbriqué)               | Taille plafonnée à 512 Ko ; analyseur itératif, sans récursion ni expression régulière à retour arrière                                                                                   | `tests/sgf.test.ts` (20 000 niveaux, 30 000 coups)             |
| **D**enial of service      | Navigateur saturé par le rendu                           | Instanciation (3 appels de dessin pour toutes les pierres), rendu à la demande après l’ouverture, densité de pixels plafonnée à 2                                                         | mesure manuelle                                                |
| **E**levation of privilege | Jeton CI trop puissant                                   | Jeton en lecture seule ; écriture limitée au seul travail de publication, déclenché à la main                                                                                             | workflows                                                      |
| **T**ampering              | Réseau de neurones ou moteur WebAssembly altéré          | Le réseau est téléchargé depuis l’origine seulement ; taille et SHA-256 vérifiés dans le navigateur avant usage ; moteur d’inférence épinglé par le lockfile                              | `e2e` (chargement réel), `src/engine/worker.ts`                |
| **T**ampering              | `'wasm-unsafe-eval'` élargit la CSP                      | Seule la compilation WebAssembly est permise ; `eval`, `new Function` et les scripts en ligne restent bloqués                                                                             | `e2e` : l’injection de script est toujours refusée             |
| **T**ampering              | Moteur physique (Rapier) : un second module WebAssembly  | Dépendance épinglée (`@dimforge/rapier3d-compat` 0.21.0), incluse au SBOM ; module compilé depuis le paquet, sans téléchargement tiers ; CSP inchangée ; importé par un seul fichier      | `pnpm arch` (règle `physique-en-un-seul-module`), `pnpm audit` |
| **D**enial of service      | Calcul du moteur qui fige la page                        | Inférence dans un Web Worker ; recherche de shicho bornée à 25 000 positions ; exploration bornée à 80 coups                                                                              | `tests/engine.test.ts`                                         |

## Hors périmètre, à la charge de l’hébergeur

- En-têtes HTTP : la CSP est posée par balise `<meta>`, qui ne peut pas exprimer
  `frame-ancestors`. Un hébergeur devrait ajouter `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff` et HSTS. GitHub Pages ne permet pas d’en-têtes personnalisés.
- `style-src` autorise `'unsafe-inline'` : React et Motion posent des styles en ligne. Le risque
  résiduel est une injection de style, sans exécution de code.

## Données sensibles

Les SGF personnels peuvent contenir des noms de joueurs et des lieux. Les fichiers restent dans le navigateur qui les a importés. Une recherche biographique envoie le terme de recherche choisi au service Wikipédia. Les positions, les coups et le contenu du SGF restent sur l’appareil.
