// Sous-ensembles latins seulement (les macrons de « Shūsaku » sont dans latin-ext). Les quelques
// kanji du récit utilisent la police Mincho du système : embarquer le japonais complet
// ajouterait 240 règles @font-face à la feuille de style.
import '@fontsource/shippori-mincho/latin-400.css';
import '@fontsource/shippori-mincho/latin-ext-400.css';
import '@fontsource/shippori-mincho/latin-600.css';
import '@fontsource/shippori-mincho/latin-ext-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountGate } from './ui/AccountGate.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('élément #root introuvable');
createRoot(root).render(
  <StrictMode>
    <AccountGate />
  </StrictMode>,
);
