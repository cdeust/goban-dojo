# Le réseau Leela Zero du lecteur

Leela Zero nº 116 est un réseau 19 × 19 entraîné par autojeu, selon une reproduction indépendante d’AlphaGo Zero. Le registre le date du 4 avril 2018 et indique un compteur d’entraînement de 6 435 001 parties. Nous avons retenu le dernier réseau promu à 10 blocs résiduels et 128 canaux avant le passage à 15 blocs et 192 canaux. La conversion en float32 pèse 13,36 Mo. [Registre de Leela Zero](https://zero.sjeng.org/) · [Projet Leela Zero](https://github.com/leela-zero/leela-zero) · [Article de Silver et al.](https://doi.org/10.1038/nature24270)

| Fichier                                                                                                                                   | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Poids gzip diffusés par Leela Zero](https://zero.sjeng.org/networks/39d465076ed1bdeaf4f85b35c2b569f604daa60076cbee9bbaab359f92a7c1c4.gz) | `81b429048b586331dd85926e6e1a09817b75b5b57275846fa6b0c370e276b073` |
| Texte décompressé, identifiant du registre                                                                                                | `39d465076ed1bdeaf4f85b35c2b569f604daa60076cbee9bbaab359f92a7c1c4` |
| `public/engine/leela-zero.onnx`, 13 364 288 octets                                                                                        | `01c7f0c5108baa55aaa1a0dd9c9f5739a88e9619e3d1f7f8366ff6453f0db7be` |

Gian-Carlo Pascutto, mainteneur de Leela Zero, a placé les réseaux et les données d’entraînement du projet dans le domaine public. [Déclaration du mainteneur](https://github.com/leela-zero/leela-zero/issues/1220#issuecomment-382456362)

## Reproduire le fichier ONNX

Depuis la racine du dépôt, dans un environnement virtuel Python 3.13 activé, exécuter les commandes suivantes. Seul le convertisseur nécessite les bibliothèques Python.

```sh
python -m pip install numpy==2.2.6 onnx==1.19.1
curl -fL https://zero.sjeng.org/networks/39d465076ed1bdeaf4f85b35c2b569f604daa60076cbee9bbaab359f92a7c1c4.gz -o lz116.gz
python scripts/convert-leela-zero.py lz116.gz public/engine/leela-zero.onnx
```

Le convertisseur vérifie le texte source avant de construire le graphe. L’entrée `board` a la forme `[1, 18, 19, 19]`. Les huit premiers plans décrivent les pierres du joueur au trait, de la position courante à sept demi-coups auparavant. Les huit suivants décrivent l’adversaire aux mêmes instants. Les deux derniers indiquent la couleur au trait. La première ligne du tenseur va de A1 à T1. La sortie `policy` donne 362 logits, dont la passe en dernier. La sortie `value` utilise la convention v1 de Leela Zero. Une valeur de +1 prédit une victoire du joueur au trait, −1 une défaite. [Description du format](https://github.com/leela-zero/leela-zero/blob/3f297889563bcbec671982c655996ccff63fa253/README.md#weights-format) · [Inférence native, lecture des poids et encodage](https://github.com/leela-zero/leela-zero/blob/3f297889563bcbec671982c655996ccff63fa253/src/Network.cpp)

## Comparer au moteur natif

Le test de CI exécute l’encodeur du lecteur et son fichier ONNX dans WebAssembly sur cinq positions. Il compare la distribution des coups et la valeur à la commande native `heatmap 0` de Leela Zero 0.17, en mode CPU avec orientation fixe. Les cas couvrent les deux couleurs au trait, deux ouvertures asymétriques, le 60ᵉ et le 277ᵉ coup de la partie s021, puis une passe ajoutée aux 272 coups de s458. Le moteur natif affiche la probabilité sur chaque intersection vide et la passe en millièmes tronqués.

```sh
pnpm exec vitest run tests/zeroModel.test.ts
```

Sur ces cinq positions, le modèle livré et le moteur natif ont donné exactement les mêmes millièmes sur chaque intersection affichée et sur la passe. L’écart maximal de probabilité de victoire a été de 0,00000271 en valeur absolue. Ce contrôle porte sur la fidélité de l’inférence. La force de jeu dépend également du budget de recherche.

Avec `leelaz` 0.17 disponible dans le PATH, on peut régénérer la référence depuis les poids texte originaux.

```sh
pnpm data:build
python scripts/capture-leela-zero.py leelaz lz116.gz > leela-zero-native.json
diff -u tests/fixtures/leela-zero-native.json leela-zero-native.json
```

## Lire une suite de coups

À la racine, les visites sont réparties entre les coups légaux. Un coup très probable peut recevoir
presque tout le budget. Le lecteur trie les branches visitées et peut relancer la recherche
depuis la position choisie. Les budgets de 32 et 128 visites sont des réglages du lecteur.
Pendant une pause, le lecteur présente d’abord jusqu’à quatre suites de douze demi-coups.
On peut demander davantage de premiers coups et reprendre une branche à sa feuille. Si la
recherche a visité moins de premiers coups que le nombre demandé, il relance une recherche en excluant les premiers coups déjà montrés.
Cette contrainte vaut seulement pour le premier coup. Le libellé distingue ces variantes,
dont les visites proviennent d’une recherche séparée.

Les parties à handicap reçoivent la compensation native de Leela Zero dans le décompte final
après deux passes. Le réseau utilise le même komi pour l’inférence sur toutes les parties.

Après le coup 60 de la partie `s001`, la recherche à 32 visites a exploré Q15, Q16 et S4.
En prolongeant à chaque fois la feuille de la variante principale, deux exécutions ont retrouvé
la même suite de 60 demi-coups légaux depuis Q15, et une autre depuis Q16. Dans la partie
de l’oreille rouge, au même budget, aucune des cinq branches visitées avant Noir 127 ne commençait
par K11. Le lecteur permet de partir du coup joué pour étudier les réponses même dans ce cas.
