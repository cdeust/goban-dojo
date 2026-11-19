import { useEffect } from 'react';
import { moveCount, useStore } from '../state/store.ts';

export const SHORTCUTS: [string, string][] = [
  ['Espace', 'Lecture / pause'],
  ['← →', 'Coup précédent / suivant'],
  ['Maj + ← →', 'Reculer / avancer de dix coups'],
  ['Début · Fin', 'Premier / dernier coup'],
  ['[ ]', 'Partie précédente / suivante'],
  ['1 2 3', 'Vue du joueur · de trois-quarts · de dessus'],
  ['N', 'Numéros des coups'],
  ['M', 'Son'],
  ['E', 'Effets de mise en scène'],
  ['Clic sur le goban', 'Modes « Deviner » et « Explorer » : proposer ou poser un coup'],
];

/** Raccourcis clavier globaux, inactifs dans les champs de saisie et les boîtes de dialogue. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState();
      if (!s.entered || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (s.mode === 'reflechir' || s.mode === 'analyser' || s.mode === 'lire') return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest('input, select, textarea, dialog, [contenteditable]')) return;
        // Espace et Entrée gardent leur rôle sur un bouton qui a le focus.
        if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a, summary')) return;
      }
      const game = s.dataset?.games[s.gameIndex];
      if (!game) return;
      const jump = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case ' ':
          s.togglePlay();
          break;
        case 'ArrowRight':
          s.step(jump);
          break;
        case 'ArrowLeft':
          s.step(-jump);
          break;
        case 'Home':
          s.step(-s.move);
          break;
        case 'End':
          s.step(moveCount(game) - s.move);
          break;
        case '[':
          s.selectGame(s.gameIndex - 1);
          break;
        case ']':
          s.selectGame(s.gameIndex + 1);
          break;
        case '1':
          s.setView('joueur');
          break;
        case '2':
          s.setView('trois-quarts');
          break;
        case '3':
          s.setView('dessus');
          break;
        case 'n':
        case 'N':
          s.toggle('showNumbers');
          break;
        case 'e':
        case 'E':
          s.toggle('effects');
          break;
        case 'm':
        case 'M':
          s.toggle('sound');
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
