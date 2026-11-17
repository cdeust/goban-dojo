import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Politique de sécurité du contenu, injectée dans la page construite.
 * L'application est statique : elle ne charge rien hors de sa propre origine.
 * (Absente en développement, où Vite injecte des styles et un client HMR en ligne.)
 */
const CSP = [
  "default-src 'none'",
  // 'wasm-unsafe-eval' : nécessaire pour compiler les modules WebAssembly (inférence, physique) (et rien d'autre :
  // ni eval, ni script en ligne).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    ),
});

export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    // Aucune ressource intégrée en « data: » : la CSP n'autorise les polices que depuis l'origine.
    assetsInlineLimit: 0,
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
