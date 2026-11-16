import { useEffect } from 'react';
import { PASS } from '../domain/board.ts';
import { chapterIndexOf } from '../story/chapters.ts';
import { momentFor } from '../story/chapters.ts';
import { moveCount, timelineOf, useStore } from '../state/store.ts';

/** Pause (ms) sur un instant remarquable, puis en fin de partie avant d'enchaîner. */
const MOMENT_PAUSE = 5200;
const END_PAUSE = 4200;

/**
 * Horloge de lecture : avance d'un coup par intervalle, marque une pause sur les instants
 * remarquables et, en lecture continue, enchaîne sur la partie suivante.
 */
export function usePlayback(): void {
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const gameIndex = useStore((s) => s.gameIndex);
  const move = useStore((s) => s.move);

  useEffect(() => {
    if (!playing) return;
    const state = useStore.getState();
    const games = state.dataset?.games;
    const game = games?.[gameIndex];
    if (!games || !game) return;
    const total = moveCount(game);

    if (move >= total) {
      const next = gameIndex + 1;
      if (!state.continuous || next >= games.length) {
        state.setPlaying(false);
        return;
      }
      const id = window.setTimeout(() => state.selectGame(next, { play: true }), END_PAUSE);
      return () => window.clearTimeout(id);
    }

    let delay = 1000 / speed;
    if (move === 0) delay = Math.max(delay, 900);
    if (momentFor(game.id, move)) delay = Math.max(delay, MOMENT_PAUSE);
    // Une passe ne pose rien : on laisse le temps de lire l'annonce.
    const last = move > 0 ? timelineOf(game).moves[move - 1] : undefined;
    if (last?.point === PASS) delay = Math.max(delay, 1200);
    const id = window.setTimeout(() => useStore.getState().setMove(move + 1), delay);
    return () => window.clearTimeout(id);
  }, [playing, speed, gameIndex, move]);

  // Le récit suit la partie en cours.
  useEffect(() => {
    const game = useStore.getState().dataset?.games[gameIndex];
    if (!game) return;
    const chapter = chapterIndexOf(game);
    if (chapter >= 0 && useStore.getState().entered) useStore.getState().setChapter(chapter);
  }, [gameIndex]);
}
