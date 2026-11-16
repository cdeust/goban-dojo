import { useStore } from '../state/store.ts';

export function TopBar() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <header className="topbar">
      <p className="brand">
        <span className="brand__kanji" lang="ja" aria-hidden="true">
          秀策
        </span>
        <span className="brand__name">Hon’inbō Shūsaku</span>
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
