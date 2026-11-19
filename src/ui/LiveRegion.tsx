import { pointToHuman } from '../domain/board.ts';
import { colorName, formatDate, prettyName } from '../story/format.ts';
import { moveCount, timelineOf, useCurrentGame, useStore } from '../state/store.ts';

/**
 * Équivalent textuel du goban pour les lecteurs d'écran : le canvas WebGL leur est opaque.
 * Pendant la lecture automatique on se tait, pour ne pas noyer l'utilisateur.
 */
export function LiveRegion() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const playing = useStore((s) => s.playing);
  const reading = useStore((s) => s.mode === 'lire');
  const readingPace = useStore((s) => s.readingPace);
  const entered = useStore((s) => s.entered);
  const variation = useStore((s) => s.variation);
  let text = '';
  if (game && entered && !playing && (!reading || readingPace === null)) {
    const head = `${prettyName(game.black)} contre ${prettyName(game.white)}, ${formatDate(game.date)}.`;
    const explored = variation.at(-1);
    if (explored) {
      text = `${reading ? 'Simulation' : 'Exploration'}, coup ${move + variation.length} : ${colorName(explored.color)} ${pointToHuman(explored.point)}.`;
    } else if (move === 0) {
      text = `${head} Position initiale${game.handicap ? `, ${game.handicap} pierres de handicap` : ''}.`;
    } else {
      const t = timelineOf(game);
      const m = t.moves[move - 1];
      const caps = t.capturesAt[move]?.length ?? 0;
      text =
        `Coup ${move} sur ${moveCount(game)} : ${m ? `${colorName(m.color)} ${pointToHuman(m.point)}` : ''}` +
        (caps ? `, ${caps} pierre${caps > 1 ? 's' : ''} capturée${caps > 1 ? 's' : ''}` : '') +
        '.';
    }
  }
  return (
    <p className="sr-only" role="status" aria-live="polite" data-testid="live">
      {text}
    </p>
  );
}
