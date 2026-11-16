# 秀策 — Hon’inbō Shūsaku, 1829-1862

Un goban en 3D pour revoir, coup après coup, les **391 parties conservées** de Hon’inbō Shūsaku,
de sa plus ancienne partie connue (1840, dix ans, trois pierres de handicap) à sa dernière partie
au château d’Edo (1861) — puis le goban vide de 1862.

![La partie de l’oreille rouge, coup 127](docs/oreille-rouge.png)

## Ce que fait l’application

- **Un récit en huit chapitres**, de l’enfant d’Innoshima au « saint du go », chaque chapitre
  renvoyant aux parties de la période.
- **Un goban de sol aux cotes réelles** (42,42 × 45,45 × 15,15 cm, lignes à 22 et 23,7 mm) :
  kaya à fil droit, pierres d’ardoise et de coquillage, bols, couvercles où s’accumulent les
  prisonniers, tatamis. Tout est procédural : aucune image, aucun modèle, aucun son n’est téléchargé.
- **Une relecture animée par [Motion](https://motion.dev)** : la pierre sort du bol, vient au-dessus
  de l’intersection, frappe et oscille un instant ; les pierres capturées s’envolent vers le
  couvercle de l’adversaire ; revenir en arrière rejoue le geste à l’envers.
- **Trois points de vue** (joueur, trois-quarts, dessus) et l’orbite libre, les numéros de coups
  façon kifu, la lecture continue d’une partie à la suivante, une recherche par adversaire, année
  ou lieu.
- **Accessible** : tout se pilote au clavier, chaque coup est annoncé en toutes lettres aux
  lecteurs d’écran, la préférence système « réduire les animations » est respectée.

## Lancer

Node 26 et pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://127.0.0.1:5173
```

Tout vérifier d’une seule commande (données, types, lint, format, tests, audit, build, e2e) :

```bash
pnpm exec playwright install chromium   # une fois
pnpm check
```

| Commande          | Rôle                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `pnpm data:fetch` | re-télécharge les SGF au commit épinglé et vérifie chaque empreinte       |
| `pnpm data:build` | reconstruit `public/data/games.json` et `data/report.json` (déterministe) |
| `pnpm test`       | moteur de règles, analyseur SGF, corpus rejoué coup par coup              |
| `pnpm e2e`        | parcours complets et contrôles de sécurité sur la version construite      |
| `pnpm sbom`       | inventaire CycloneDX des dépendances de production                        |
| `pnpm build`      | données + site statique dans `dist/`                                      |

## Les données

460 fichiers SGF mentionnant Shūsaku, tirés du _Professional Go Dataset_
([wangjinzhuo/pgd](https://github.com/wangjinzhuo/pgd), commit `b1e006b`), donnent après
nettoyage **391 parties distinctes et 75 193 coups**. Le détail du traitement, les contrôles
et les réserves sont dans [docs/DONNEES.md](docs/DONNEES.md). En bref :

- chaque partie est rejouée par le moteur de règles : **zéro coup illégal** ;
- 65 doublons sont fusionnés, y compris ceux enregistrés sous une autre orientation du goban ;
- le corpus recoupe l’histoire : **19 parties du château, 19 victoires** ; **23 parties** du
  sanjūbango contre Ōta Yūzō, la dernière nulle ; l’oreille rouge en 325 coups, coup 127 en K11 ;
- deux parties portent une date impossible (1839, « 6ᵉ dan ») : elles sont isolées, pas corrigées.

Le récit s’appuie sur deux révisions datées de Wikipédia (fr, en), citées dans l’application
et dans [`src/story/chapters.ts`](src/story/chapters.ts).

## Architecture

```
data/raw/*.sgf ──► scripts/build-data.ts ──► public/data/games.json
                        │ (src/domain : SGF, règles, vie de chaque pierre)
                        ▼
src/state/store.ts ──► src/replay (horloge, son) ──► src/scene (three.js + Motion)
        │                                              Goban · Stones · Bowls · Room · CameraRig
        └────────────► src/ui (récit, parties, commandes) ◄── src/story (chapitres, sources)
```

`src/domain` ne dépend de rien et sert à la fois au pipeline de données, à l’application et aux
tests. Dans la scène, chaque pierre physique est une instance dont l’état cible (dans le bol, sur
le goban, prisonnière) se déduit du numéro de coup ; Motion anime le passage d’un état à l’autre.

## Qualité et sécurité

- [docs/MENACES.md](docs/MENACES.md) — modèle de menaces STRIDE et mesures en place.
- [docs/JOURNAL.md](docs/JOURNAL.md) — journal des expériences, échecs compris.
- Dépendances en versions exactes, lockfile figé, actions GitHub épinglées par empreinte,
  SBOM CycloneDX, `pnpm audit`, ESLint avec règles de sécurité et CodeQL (SAST), tests Playwright
  contre la version construite avec vérification de la CSP et de l’absence de toute requête
  sortante (DAST).

## Licences

Le code est sous licence MIT. Les textes biographiques sont rédigés à partir de Wikipédia
(CC BY-SA 4.0), cité. Les kifus sont des parties du XIXᵉ siècle ; les fichiers SGF proviennent
du dépôt PGD, qui ne déclare pas de licence — voir [docs/DONNEES.md](docs/DONNEES.md).
La police Shippori Mincho est sous SIL OFL 1.1.
