# Yose et comptage japonais

## Provenance

Les cinq modules du niveau 9 exploitent uniquement les coups de la collection historique
locale. L’échantillonnage intercale les parties sur la chronologie et choisit les coups à
partir du 120e demi-coup ou des derniers 30 % du kifu. Il sélectionne des captures de
plusieurs tailles, des frontières noires, blanches et mixtes, et des changements de bilan
géométrique tant positifs, négatifs que nuls. Les exercices ne prétendent pas identifier
automatiquement la phase de yose ni l’optimalité du coup enregistré.

Le fichier de 469 parties ne documente aucun komi et aucune partie ne termine par un coup
de passe enregistré. Il est donc impossible d'adjudiquer exactement leurs derniers
gobans sur ces seuls éléments ; les marges déclarées restent celles de la source.

## Règle de comptage

Le calculateur de points japonais prend un goban réglé par accord des joueurs, les
prisonniers déjà capturés, les chaînes mortes à retirer, les chaînes vivantes en seki et
le komi explicite. Il refuse un retrait hors du territoire adverse, conformément à
l'article 10. Il compte les points vides entourés par une seule couleur, excepté les
zones bordées par des chaînes en seki (article 8). Après retrait des morts, leurs
pierres s'ajoutent aux prisonniers adverses. Le komi s'ajoute aux Blancs. Il ne
résout pas la vie/mort, ne décide pas du seki et ne déduit jamais le komi.

Référence : Nihon Kiin et Kansai Kiin, _The Japanese Rules of Go_ (1989), traduction
anglaise publiée par la Nihon Kiin, articles 7 à 10 et commentaire de l’article 10,
[texte de référence archivé](https://www.cs.cmu.edu/~wjh/go/rules/Japanese.html).

Les questions de changement local utilisent un bilan purement géométrique avant
komi et sans adjudication : le territoire réel ou la valeur d'un échange de yose
complet peuvent différer.
