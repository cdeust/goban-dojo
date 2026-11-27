# Leçons

- Une partie célèbre peut illustrer la mise en scène. Pour valider sa portée,
  vérifier aussi les deux couleurs dans une autre partie et mesurer la couverture
  sur le corpus.
- Pour une scène de réflexion, vérifier la géométrie des effets sur la grille
  et la succession des positions. Une lueur et un panneau ne montrent pas à eux seuls
  les réponses prévues par le joueur.
- Quand une simulation doit partager le cadrage du goban, vérifier les
  coordonnées et dimensions du canvas avant et pendant l’animation.
- Quand on remplace un plateau de simulation par le goban principal, vérifier
  aussi les effets d’ambiance de la scène précédente.
- Pour distinguer les coups simulés, vérifier sur le même goban que le halo
  apparaît sur les pierres ajoutées et disparaît à la position initiale.
- Pour un halo discret, comparer la diffusion et l’intensité autour de la pierre
  avec le rendu précédent, à la taille réelle du goban mobile.
- Un test mobile du mode Regarder ne garantit pas la jouabilité de Deviner :
  le volet de leçon couvrait le centre du canvas et la barre de navigation
  chevauchait son titre. Reproduit à 393 × 690 : trois invariants de disposition
  échouaient. La navigation, le goban (46 % de la hauteur utile), la leçon et le
  dock ont chacun leur rangée ; la page défile sans fenêtre de texte superposée.
  Le test vérifie ces invariants et résout la leçon en touchant O13 directement.
  Trois passages Chromium tactiles sans réessai, plus contrôle visuel local ;
  Safari iOS sur appareil physique reste à vérifier.

- En CI Linux le temps de rendu logiciel varie : la PR #25 (89d811c) a
  validé 22 scénarios sans assertion en échec avant l’annulation à 25 minutes
  (run 46054808874). Les 28 passent localement sans réessai en 3,8 minutes.
  Le budget global du job est porté à 40 minutes ; aucun délai individuel,
  scénario, assertion, contrôle de sécurité ou permission n’est modifié.
