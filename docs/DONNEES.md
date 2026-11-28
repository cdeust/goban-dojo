# Les données : provenance, traitement, réserves

## Provenance

### Source principale — « Games by Shusaku », A. E. Brouwer (CWI, Amsterdam)

| Élément | Valeur                                                                                |
| ------- | ------------------------------------------------------------------------------------- |
| Page    | <https://homepages.cwi.nl/~aeb/go/games/games/Shusaku/>                               |
| Archive | <https://homepages.cwi.nl/~aeb/go/games/shusaku.tgz>                                  |
| SHA-256 | `f1579444185cd7f516a433aad35a0cad93bd2c76d302602088448513dcd58650`                    |
| Contenu | 470 fichiers SGF (`data/cwi/NNN.sgf`), empreinte de chacun dans `data/cwi.sha256`     |
| Origine | dérivée du recueil 本因坊秀策全集 (471 parties), romanisée et corrigée par son auteur |
| Apports | pour chaque partie, la date japonaise (`JD`) **et** sa conversion grégorienne (`DT`)  |

L’auteur précise que deux fichiers du recueil d’origine décrivaient la même partie (d’où
l’absence de `194.sgf`) et que `030.sgf` ne porte que des métadonnées : le kifu de cette partie
du 6 septembre 1842 contre Ōta Yūzō est perdu.

### Source complémentaire — _Professional Go Dataset_ (PGD)

| Élément   | Valeur                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Dépôt     | <https://github.com/wangjinzhuo/pgd>, commit `b1e006b49dc286f8c513953e5caad0901cd2e895`                                               |
| Référence | J. Wang, W. Wang, R. Wang, W. Gao, AAAI 2017                                                                                          |
| Contenu   | 460 chemins dont le nom contient « Shusaku » (`data/pgd/sources.tsv`), 458 contenus distincts dans `data/pgd/raw/<empreinte git>.sgf` |
| Rôle      | uniquement le lieu et les circonstances des parties, que la source principale ne donne pas                                            |

`pnpm data:fetch` restaure ces fichiers depuis les sources épinglées et refuse tout contenu
dont l’empreinte diffère du manifeste. `pnpm data:build` est déterministe : deux exécutions
produisent un `games.json` identique à l’octet près, ce que la CI vérifie à chaque passage.

## Traitement (`scripts/build-data.ts`)

1. **Analyse SGF** de chaque fichier CWI, ligne principale.
2. **Relecture** par le moteur de règles (`src/domain/board.ts`) : capture, suicide, ko, point
   occupé. Tout coup illégal serait consigné dans le rapport.
3. **Contrôle des doublons** : aucune paire de parties ne partage plus de 90 % de ses 80 premiers
   coups, à une rotation ou une réflexion du goban près.
4. **Appariement avec PGD** selon ce même critère, pour reprendre lieu et circonstances.
   Les lieux, donnés en anglais par les sources, sont traduits en français (`scripts/places.ts`) ;
   les noms propres gardent leur transcription d’origine.
5. **Tri chronologique** ; une date connue au mois ou à l’année près est placée au milieu de sa
   période.

## Résultat (`data/report.json`)

| Mesure                                  | Valeur                                   |
| --------------------------------------- | ---------------------------------------- |
| Parties                                 | 469, dont 4 rengo                        |
| Période                                 | 14 décembre 1839 – 19 juin 1862          |
| Coups                                   | 85 577                                   |
| Coups illégaux                          | 0                                        |
| Doublons internes                       | 0                                        |
| Parties à handicap (2, 3, 4, 5 pierres) | 88, 25, 4, 2                             |
| En tête-à-tête : victoires / décidées   | 275 / 400, plus 13 jigo et 51 inachevées |
| Parties enrichies par PGD               | 188                                      |
| Dates au jour, au mois, à l’année       | 452, 13, 4                               |

Toutes les parties de PGD où Shūsaku joue se retrouvent dans la collection CWI ; les deux seuls
fichiers PGD sans équivalent sont des fêtes de promotion où il ne joue pas.

## Recoupements avec l’histoire (vérifiés par `tests/dataset.test.ts`)

- **Oshirogo** : 19 parties du 31 décembre 1849 au 18 décembre 1861, 19 victoires de Shūsaku.
- **Sanjūbango** : 23 parties numérotées contre Ōta Yūzō en 1853, la dernière nulle.
- **Oreille rouge** : 11, 14 et 15 septembre 1846, 325 coups, Noir +2, coup 127 en K11.
- **Shūwa** : en tête-à-tête, Shūsaku joue toujours Noir contre son maître.
- **Dernière partie** : 19 juin 1862, inachevée après 38 coups.

## Réserves

- **Enfance.** Les deux plus anciennes parties datent des 14 et 24 décembre 1839 (dix ans, sous
  le nom de Yasuda Eisai). Aucun kifu antérieur n’a été trouvé : les parties de 1837 contre Itō
  Shōwa ou contre le seigneur Asano ne sont connues que par le récit. Sources consultées sans
  succès pour d’autres parties : Sensei’s Library, u-go.net, Trevoke/shusaku (11 parties, toutes
  déjà présentes) ; go4go, gokifu et waltheri étaient inaccessibles ; GoGoD est commercial et n’a
  pas été consulté.
- **Deux parties écartées.** PGD contient deux parties (une de « 1844-10-13 », une de
  « 1855.01.20 ») absentes de la collection CWI et de son recueil d’origine. Faute de
  corroboration, elles ne sont pas incluses.
- **Parties incomplètes.** 51 parties sont inachevées et une est d’issue inconnue : la relecture
  s’arrête où s’arrête le kifu.
- **Variantes de transcription.** Pour quatre parties, PGD et CWI divergent sur l’ordre de
  quelques coups ; la version CWI est retenue, sans que la bonne ait été établie.
- **Deux divergences signalées.** Pour la partie du château du 20 décembre 1850 (s269), le kifu
  compte 220 coups, l’index de la collection et PGD 193. Pour la partie du 17 novembre 1851 contre
  Shūwa (s306), le kifu donne Noir +4, l’index et PGD Noir +2. Le corpus suit le kifu et affiche la
  divergence dans le cartouche de la partie.
- **Total connu.** Wikipédia (fr) cite 388 parties, chiffre d’une édition ancienne des œuvres
  complètes ; le recueil dont dérive ce corpus en compte 471.
- **Licence.** [La page générale CWI](https://homepages.cwi.nl/~aeb/go/games/) indique que le compilateur ne revendique aucun droit et présente les parties comme relevant du domaine public ; PGD ne déclare pas de licence. Cela ne vaut pas une licence indépendante pour des annotations ou des fonds tiers. Les coups de parties jouées
  entre 1839 et 1862 sont des faits historiques ; les fichiers sont redistribués ici inchangés,
  avec leur provenance. Tout ayant droit estimant ses droits lésés peut ouvrir un ticket : les
  fichiers seront retirés et `pnpm data:fetch` suffira à les reconstituer localement.

## Biographie

Le récit (`src/story/chapters.ts`) ne contient que des faits présents dans deux révisions datées
de Wikipédia (fr `240986053`, en `1381490013`) et sur la page de la collection CWI, dont viennent
les dates grégoriennes des promotions. Les dimensions du matériel viennent de Sensei’s Library,
« Equipment Dimensions ».

## Erratum

La première version publiée de ce projet (391 parties, tirées de PGD seul) classait à tort les
deux parties de 1839 comme « date impossible » : PGD les étiquette « 6ᵉ dan » et écrit leur date
lunaire comme une date occidentale. Ce sont bien les deux plus anciennes parties connues. Dans
cette même version, 132 dates étaient des dates lunaires prises pour grégoriennes.
