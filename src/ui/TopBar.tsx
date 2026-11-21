import { useCurrentGame, useStore } from '../state/store.ts';
import { reflectionsOf } from '../state/reflections.ts';

export function TopBar() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const game = useCurrentGame();
  const reflecting = useStore((s) => s.mode === 'reflechir');
  const scenes = game ? reflectionsOf(game) : [];
  return (
    <header className="topbar">
      <p className="brand">
        <span className="brand__kanji" lang="ja" aria-hidden="true">
          囲碁
        </span>
        <span className="brand__name">Goban Dojo</span>
      </p>
      <nav className="topbar__nav" aria-label="Volets">
        <button
          type="button"
          className="chip"
          aria-expanded={panel === 'recit'}
          aria-controls="panel"
          onClick={() => setPanel(panel === 'recit' ? null : 'recit')}
        >
          Récit
        </button>
        <button
          type="button"
          className="chip"
          aria-expanded={panel === 'parties'}
          aria-controls="panel"
          onClick={() => setPanel(panel === 'parties' ? null : 'parties')}
        >
          Parties
        </button>
        {!reflecting && scenes.length > 0 && (
          <button
            type="button"
            className="chip chip--accent"
            onClick={() => {
              const s = useStore.getState();
              const scene =
                scenes.find(({ after }) => after === s.move) ??
                scenes.find(({ after }) => after === s.move - 1) ??
                scenes.find(({ after }) => after > s.move) ??
                scenes.at(-1);
              const after = scene?.after;
              if (after !== undefined) s.showReflection(after);
            }}
          >
            Réflexion
          </button>
        )}
        <button type="button" className="chip" {...HELP_INVOKER}>
          Aide &amp; sources
        </button>
      </nav>
    </header>
  );
}

/**
 * `command` / `commandfor` ouvrent la boîte de dialogue sans script dans les navigateurs récents
 * (les types de React ne connaissent pas encore ces attributs) ; ailleurs, on l'ouvre à la main.
 */
const HELP_INVOKER = {
  command: 'show-modal',
  commandfor: 'help',
  onClick: () => {
    if ('commandForElement' in HTMLButtonElement.prototype) return;
    const dialog = document.getElementById('help');
    if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
  },
} as React.ButtonHTMLAttributes<HTMLButtonElement>;
