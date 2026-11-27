import { neighbours, opposite, PASS, POINTS, type Board, type Color } from './board.ts';
import { trainingPosition, type TrainingGame } from './trainingGame.ts';

export interface TrainingFocus {
  module: string;
  reason: string;
}
function adjacentChains(board: Board, point: number, color: Color): number[] {
  return [
    ...new Set(
      neighbours(point)
        .filter((p) => board.get(p) === color)
        .map((p) => Math.min(...board.stonesOf(p))),
    ),
  ];
}
/** Propose un chapitre à partir de différences observables, pas une causalité supposée du verdict IA. */
export function trainingFocus(
  game: TrainingGame,
  number: number,
  best: number,
): TrainingFocus | undefined {
  const played = game.moves[number - 1];
  if (!played || played.color !== game.human) return undefined;
  const { board, seen } = trainingPosition(game.moves.slice(0, number - 1));
  if (!Number.isInteger(best) || best < PASS || best >= POINTS) return undefined;
  const preferred = board.clone(),
    actual = board.clone();
  const reference = preferred.play(played.color, best);
  const own = actual.play(played.color, played.point);
  if (reference.illegal || own.illegal || (best !== PASS && seen.has(preferred.positionKey())))
    return undefined;
  if (reference.captures.length > own.captures.length)
    return {
      module: reference.captures.length > 1 ? 'capture-chain' : 'capture-one',
      reason: `Le candidat du moteur capture ${reference.captures.length} pierre(s), votre coup ${own.captures.length}. Revoir le principe de capture peut être utile.`,
    };
  const examined = new Set<number>();
  for (let p = 0; p < POINTS; p++) {
    if (board.get(p) !== played.color || examined.has(p)) continue;
    for (const q of board.stonesOf(p)) examined.add(q);
    if (board.libertyCount(p) === 1 && preferred.libertyCount(p) >= 2 && actual.libertyCount(p) < 2)
      return {
        module: 'escape',
        reason:
          'Le candidat augmente les libertés d’une de vos chaînes en atari ; votre coup ne le fait pas. Travaillez le sauvetage.',
      };
  }
  if (
    best !== PASS &&
    adjacentChains(board, best, played.color).length >= 2 &&
    adjacentChains(board, played.point, played.color).length < 2 &&
    preferred.libertyCount(best) >= 2
  )
    return {
      module: 'connect',
      reason:
        'Le candidat de comparaison relie plusieurs chaînes amies. Revoir les connexions permet de comparer cette propriété à votre décision.',
    };
  if (
    best !== PASS &&
    adjacentChains(board, best, opposite(played.color)).some(
      (p) =>
        board.libertyCount(p) > 1 && preferred.libertyCount(p) === 1 && actual.libertyCount(p) > 1,
    )
  )
    return {
      module: 'atari',
      reason:
        'Le candidat met une chaîne adverse en atari, contrairement au coup joué. Travaillez cette menace locale.',
    };
  if (number <= 40)
    return {
      module: 'fuseki',
      reason:
        'Cette décision appartient à l’ouverture. Revoir la répartition des forces fournit des positions comparables, sans identifier à elle seule la cause d’un écart.',
    };
  if (number >= 150)
    return {
      module: 'yose-value',
      reason:
        'Cette décision est tardive ; travaillez le bilan local de fin de partie, sans supposer que le kifu était déjà réglé.',
    };
  return {
    module: 'initiative',
    reason:
      'Comparez vos choix locaux et globaux sur une autre position réelle. Le verdict du moteur ne suffit pas à identifier la cause de l’écart.',
  };
}
