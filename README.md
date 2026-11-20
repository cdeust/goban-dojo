# 秀策 — Hon’inbō Shūsaku, 1829-1862

Un goban en 3D pour revoir, coup après coup, **469 parties** de Hon’inbō Shūsaku : de la plus
ancienne qui nous soit parvenue (14 décembre 1839, il a dix ans) à la dernière, inachevée, du
19 juin 1862, dix semaines avant sa mort.

**En ligne : <https://cdeust.github.io/shusaku-goban/>**

![La partie de l’oreille rouge, coup 127](docs/oreille-rouge.png)

## Ce que fait l’application

- **Un récit en huit chapitres**, de l’enfant d’Innoshima au « saint du go », chaque chapitre
  renvoyant aux parties de la période.
- **Un goban de sol aux cotes réelles** (42,42 × 45,45 × 15,15 cm, lignes à 22 et 23,7 mm), en
  rendu réaliste : kaya à fil droit sur ses pieds tournés, pierres d’ardoise et de coquillage,
  bols de bois, dans un salon à tatamis éclairé par ses shōji. Tout est procédural : aucune image,
  aucun modèle, aucun son n’est téléchargé.
- **Une relecture animée par [Motion](https://motion.dev)** : la pierre sort du bol, vient au-dessus
  de l’intersection, frappe et oscille un instant ; revenir en arrière rejoue le geste à l’envers.
- **Des pierres qui tombent pour de bon** : une pierre capturée vole jusqu’au-dessus du couvercle
  de l’adversaire, y chute, rebondit et s’entasse sur les précédentes ; les bols sont garnis de
  pierres simulées de la même façon (moteur physique [Rapier](https://rapier.rs), obstacles tirés
  des maillages des bols et couvercles). Sauter à n’importe quel coup montre le même couvercle
  qu’y arriver coup par coup.
- **Étudier le kifu** (mode « Étudier ») : filtrez les captures, les ataris et les connexions de
  la partie. Comparez la position avant et après le coup, repérez les pierres sur le goban et
  essayez une variante depuis la position de départ.
- **Temps de réflexion** : dans la partie de l’oreille rouge, revenez aux interruptions après
  les coups 89 et 141 ou à la position avant Noir 127. Comparez les coups du kifu avec des
  variantes pédagogiques, à votre rythme. Les temps de réflexion individuels sont inconnus.
- **Simuler avec Leela Zero**, une reproduction publique d’AlphaGo Zero. Avant les coups forts,
  le goban rejoue les suites explorées par le moteur. Depuis « Analyser », ouvrez la lecture
  longue pour choisir une branche et suivre les réponses des deux camps, y compris dans
  votre propre SGF. Pendant une pause, « Plus de variantes et de coups » permet de chercher
  d’autres premiers coups et de prolonger la variante affichée. Pour étudier une fin de partie,
  filtrez « Parties terminées par abandon » puis choisissez « Continuer après l’abandon » dans
  la fiche. Depuis le dernier coup enregistré, choisissez « Comparer 10 variantes de 20 coups » pour étudier dix réponses possibles sur le même goban. À chaque coup, l’encart indique l’avance estimée et les points gagnés ou perdus par le joueur. Les variantes sont classées par gain estimé au premier coup. Vous pouvez ainsi comparer le coup du kifu au meilleur départ évalué.
  [Provenance des poids et vérification](docs/LEELA-ZERO.md)
- **Lire les variantes** : depuis une position du kifu, le bouton « Analyser » ouvre jusqu’à
  144 suites de deux coups avec KataGo. Cliquez sur un repère lumineux pour jouer un coup,
  examiner les réponses et comparer l’avance estimée à celle du coup historique.
- **Jouer comme Shūsaku** (mode « Deviner ») : la partie s’arrête à chacun de ses coups et vous
  demande où il joue. Un essai manqué donne la distance et une zone qui se resserre ; 3 points du
  premier coup, 2 après un indice, 1 après deux, puis le coup est montré.
- **Explorer une autre suite** (mode « Explorer ») : à partir de n’importe quelle position, posez
  vos propres coups, captures et ko compris, puis revenez à la partie. Sur demande, un réseau de
  neurones de KataGo, exécuté dans le navigateur, juge chaque coup — bon, discutable ou erreur
  probable — et le compare au coup réellement joué. Voir [docs/MOTEUR.md](docs/MOTEUR.md) pour ce
  que vaut ce jugement.
- **L’ouverture de Shūsaku, repérée dans les kifus** : les 68 parties où elle est jouée sont
  signalées, avec une légende aux coups 5 et du kosumi ; le récit en donne le bilan chiffré.
- **Des marques qui disent ce que fait un coup** : halo rouge sous les pierres en atari
  (attaque), cage tournante autour des pierres prises dans un shicho qui fonctionne (piège), halo
  bleu sous le coup qui relie deux groupes (connexion). Le coup lui-même frappe avec un éclat et
  des lignes de force ; au coup 127 de la partie de l’oreille rouge, la scène s’assombrit autour
  de la pierre. Tout se coupe d’un bouton.
- **Le son d’une pierre sur du bois massif**, par synthèse modale (choc bref, résonances fixes du
  plateau, acoustique d’une pièce calme) : aucun fichier audio. Les réglages sont une seule table,
  dans `src/replay/sound.ts`.
- **Trois points de vue** (joueur, trois-quarts, dessus) et l’orbite libre, les numéros de coups
  façon kifu, la lecture continue d’une partie à la suivante, une recherche par adversaire, année
  ou lieu (les lieux sont donnés en français).
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
| `pnpm test`       | règles, analyseur SGF, corpus rejoué, ouverture, lieux, physique, moteur  |
| `pnpm arch`       | frontières entre couches et absence de cycles d’imports                   |
| `pnpm e2e`        | parcours complets et contrôles de sécurité sur la version construite      |
| `pnpm sbom`       | inventaire CycloneDX des dépendances de production                        |
| `pnpm build`      | données + site statique dans `dist/`                                      |

## Les données

Le corpus vient de la collection « Games by Shusaku » d’A. E. Brouwer (CWI) : 470 fichiers SGF
dérivés du recueil 本因坊秀策全集, avec pour chaque partie la date japonaise et sa conversion
grégorienne. Le _Professional Go Dataset_ complète le lieu et les circonstances de 188 parties ;
les lieux, donnés en anglais par les sources, sont traduits en français.
Les deux sources sont épinglées et vérifiées par empreinte. Le détail du traitement, les
contrôles et les réserves sont dans [docs/DONNEES.md](docs/DONNEES.md). En bref :

- **469 parties, 85 577 coups**, chacune rejouée par le moteur de règles : **zéro coup illégal** ;
- le corpus recoupe l’histoire : **19 parties du château, 19 victoires** ; **23 parties** du
  sanjūbango contre Ōta Yūzō, la dernière nulle ; l’oreille rouge en 325 coups, coup 127 en K11 ;
- aucun kifu antérieur à décembre 1839 n’a été trouvé : les parties de l’enfance à Innoshima ne
  sont connues que par le récit ;
- 51 parties sont inachevées, une partie de 1842 n’a laissé que ses métadonnées ;
- l’ouverture de Shūsaku est jouée dans **68 parties**, dont 52 de sa main (42 victoires).

Le récit s’appuie d’abord sur l’Institut japonais de go (日本棋院), qui confirme l’entrée chez
Jōwa, le titre d’héritier, les dix-neuf victoires au château, le coup 127 et la mort du choléra.
Le reste (naissance, grades, match contre Ōta Yūzō) vient encore de deux révisions datées de
Wikipédia (fr, en) et **attend une confirmation** par une source de référence. Une divergence est
signalée dans le récit : l’oreille rouge est gagnée de deux points selon le kifu, de trois selon
l’Institut. Toutes les sources sont citées dans l’application et dans
[`src/story/chapters.ts`](src/story/chapters.ts).

## Architecture

```
data/cwi + data/pgd ──► scripts/build-data.ts ──► public/data/games.json
                        │ (src/domain : SGF, règles, vie de chaque pierre, ouverture)
                        ▼
src/state/store.ts ──► src/replay (horloge, son) ──► src/scene (three.js + Motion)
        │                                              Goban · Stones · Bowls · Room · CameraRig
        │                                              physics (Rapier) : chute et repos des pierres
        └────────────► src/ui (récit, parties, commandes) ◄── src/story (chapitres, sources)
```

`src/domain` ne dépend de rien et sert à la fois au pipeline de données, à l’application et aux
tests ; `src/engine` (encodage des positions, jugement des coups) ne dépend que du domaine. Ces
frontières sont vérifiées par `pnpm arch`, qui échoue sur tout import interdit ou cyclique ; le
moteur physique n’est importé que par `src/scene/physics.ts`. Dans la scène, chaque pierre physique est une instance dont l’état cible (dans le bol, sur
le goban, prisonnière) se déduit du numéro de coup ; Motion anime le passage d’un état à l’autre.

## Qualité et sécurité

- [docs/MENACES.md](docs/MENACES.md) — modèle de menaces STRIDE et mesures en place.
- [docs/JOURNAL.md](docs/JOURNAL.md) — journal des expériences, échecs compris.
- Dépendances en versions exactes, lockfile figé, actions GitHub épinglées par empreinte,
  SBOM CycloneDX, `pnpm audit`, ESLint avec règles de sécurité et CodeQL (SAST), tests Playwright
  contre la version construite avec vérification de la CSP et de l’absence de toute requête
  sortante (DAST).

## Licences

Le code est sous licence MIT. Les textes biographiques sont rédigés à partir du site de
l’Institut japonais de go et de Wikipédia (CC BY-SA 4.0), cités. Les kifus sont des parties du XIXᵉ siècle ; les fichiers SGF proviennent
de deux collections qui ne déclarent pas de licence — voir [docs/DONNEES.md](docs/DONNEES.md).
La police Shippori Mincho est sous SIL OFL 1.1. Le moteur physique Rapier est sous Apache-2.0. Le réseau de neurones et le code porté de KataGo
sont décrits dans [public/engine/LICENCE.txt](public/engine/LICENCE.txt).
