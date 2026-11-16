# Les données : provenance, traitement, réserves

## Provenance

| Élément   | Valeur                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| Source    | _Professional Go Dataset_ (PGD), <https://github.com/wangjinzhuo/pgd>                        |
| Référence | J. Wang, W. Wang, R. Wang, W. Gao, « Beyond Monte Carlo Tree Search… », AAAI 2017            |
| Commit    | `b1e006b49dc286f8c513953e5caad0901cd2e895`                                                   |
| Sélection | les 460 chemins du dépôt dont le nom contient « Shusaku » (`data/sources.tsv`)               |
| Fichiers  | 458 contenus distincts, conservés tels quels dans `data/raw/<empreinte git>.sgf`             |
| Intégrité | chaque fichier est nommé par son SHA-1 de blob git ; l’empreinte est revérifiée à la lecture |

`pnpm data:fetch` re-télécharge ces fichiers depuis le commit épinglé et refuse tout contenu
dont l’empreinte diffère. `pnpm data:build` est déterministe : deux exécutions produisent un
`games.json` identique à l’octet près, ce que la CI vérifie à chaque passage.

## Traitement (`scripts/build-data.ts`)

1. **Analyse SGF** — ligne principale seulement (un fichier porte des variantes commentées).
2. **Exclusion** — 2 fichiers citent Shūsaku dans l’intitulé d’une fête sans qu’il y joue.
3. **Relecture** — chaque partie est rejouée par le moteur de règles (`src/domain/board.ts`) :
   capture, suicide, ko, point occupé. Tout coup illégal serait consigné dans le rapport.
4. **Fusion des doublons** — deux enregistrements sont la même partie s’ils partagent la même
   mise en place et les 30 premiers coups, à une rotation ou une réflexion du goban près ;
   en seconde passe, deux transcriptions de même longueur contre le même adversaire, identiques à
   plus de 90 %, sont fusionnées (une paire : 98,2 %). L’enregistrement le plus complet est gardé,
   les métadonnées manquantes sont reprises des autres, tous les chemins d’origine sont conservés.
5. **Normalisation** — variantes de noms (Sendaiu/Sendayu, Ebizawa/Ebisawa, Genan/Gennan,
   Hon’inbō/Murase Shūho), grades, résultats, intitulés des rencontres.

## Résultat (`data/report.json`)

| Mesure                          | Valeur                  |
| ------------------------------- | ----------------------- |
| Parties distinctes              | 391                     |
| Doublons fusionnés              | 65                      |
| Coups                           | 75 193                  |
| Coups illégaux                  | 0                       |
| Parties à handicap (2, 3, 4)    | 74, 17, 3               |
| Victoires de Shūsaku / décidées | 254 / 361, plus 11 jigo |

## Recoupements avec l’histoire (vérifiés par `tests/dataset.test.ts`)

- **Oshirogo** : 19 parties de 1849 à 1861, 19 victoires de Shūsaku, aucune en 1855 — conforme au
  record rapporté par les sources.
- **Sanjūbango** : 23 parties contre Ōta Yūzō en 1853, la dernière nulle — conforme (23 jouées sur 30).
- **Oreille rouge** : 11 septembre 1846, 325 coups, Noir +2, coup 127 en K11.
- **Shūwa** : Shūsaku joue Noir dans les 24 parties contre son maître.

## Réserves

- **Calendrier.** La source mêle dates grégoriennes et dates lunaires japonaises recopiées telles
  quelles. Les parties du château datées « 11-17 » se jouaient le 17ᵉ jour du 11ᵉ mois lunaire ;
  quand deux enregistrements d’une même partie divergent, les deux dates sont conservées
  (`dateRaw`). L’ordre chronologique est fiable à l’année, pas toujours au mois.
- **Deux dates impossibles.** Deux parties sont datées de novembre 1839 avec Shūsaku « 6ᵉ dan »,
  alors qu’il reçoit son premier dan en janvier 1840. Elles sont marquées `dateSuspect` et classées
  à part. Leur date réelle n’a pas été devinée.
- **Parties incomplètes.** 18 parties sont notées inachevées, et plusieurs kifus s’arrêtent avant
  la fin (« suite des coups inconnue ») : la relecture s’arrête où s’arrête la source.
- **Exhaustivité.** Wikipédia (fr) évoque 388 parties conservées ; ce corpus en compte 391 après
  dédoublonnage. L’écart n’a pas été élucidé.
- **Licence.** Le dépôt PGD ne déclare aucune licence. Les coups d’une partie de 1846 sont des
  faits historiques ; les fichiers sont redistribués ici inchangés, avec leur provenance. Tout
  ayant droit estimant ses droits lésés peut ouvrir un ticket : les fichiers seront retirés et
  `pnpm data:fetch` suffira à les reconstituer localement.

## Biographie

Le récit (`src/story/chapters.ts`) ne contient que des faits présents dans deux révisions datées
de Wikipédia (fr `240986053`, en `1381490013`). Quand elles divergent (4ᵉ dan en 1843 ou 1844),
le texte le dit. Les dimensions du matériel viennent de Sensei’s Library, « Equipment Dimensions ».
