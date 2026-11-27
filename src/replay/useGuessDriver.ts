import { useEffect } from 'react';
import { PASS } from '../domain/board.ts';
import { timelineOf, useStore } from '../state/store.ts';

/** Délai (ms) avant que l'adversaire de Shūsaku ne réponde, en mode « deviner ». */
const REPLY_DELAY = 750;

/**
 * Mode « deviner » : les coups de l'adversaire (et les passes) se jouent seuls ;
 * la partie attend l'utilisateur quand c'est à Shūsaku de jouer.
 */
export function useGuessDriver(): void {
  const mode = useStore((s) => s.mode);
  const gameIndex = useStore((s) => s.gameIndex);
  const move = useStore((s) => s.move);
  const lesson = useStore((s) => s.lesson);
  const color = useStore((s) => s.guessColor);

  useEffect(() => {
    if (mode !== 'deviner' || lesson) return;
    const s = useStore.getState();
    const game = s.dataset?.games[gameIndex];
    if (!game) return;
    const next = timelineOf(game).moves[move];
    if (!next || (next.color === color && next.point !== PASS)) return;
    const id = window.setTimeout(() => {
      // Avance sans passer par setMove, qui effacerait l'essai en cours.
      useStore.setState({ move: move + 1 });
    }, REPLY_DELAY);
    return () => window.clearTimeout(id);
  }, [mode, gameIndex, move, color, lesson]);
}
