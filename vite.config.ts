import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Politique de sécurité du contenu, injectée dans la page construite.
 * L'application est statique : les fichiers du jeu sont servis par la même origine.
 * La recherche biographique lancée par le joueur peut aussi interroger Wikipédia.
 * (Absente en développement, où Vite injecte des styles et un client HMR en ligne.)
 */
function contentSecurityPolicy(authOrigin: string) {
  return [
    "default-src 'none'",
    // 'wasm-unsafe-eval' : nécessaire pour compiler les modules WebAssembly (inférence, physique) (et rien d'autre :
    // ni eval, ni script en ligne).
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://fr.wikipedia.org/w/api.php https://en.wikipedia.org/w/api.php${authOrigin ? ' ' + authOrigin : ''}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const csp = (authOrigin: string): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(authOrigin)}" />`,
    ),
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let authOrigin = '';
  if (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY)
    throw new Error('Aucune clé Supabase ne doit être configurée dans Vite.');
  if (env.VITE_GOBAN_API_URL) {
    const url = new URL(env.VITE_GOBAN_API_URL);
    const localTest =
      mode === 'account-test' && url.protocol === 'http:' && url.hostname === '127.0.0.1';
    if (
      (!localTest && url.protocol !== 'https:') ||
      url.origin !== env.VITE_GOBAN_API_URL.replace(/\/$/, '')
    )
      throw new Error('URL HTTPS du backend attendue.');
    authOrigin = url.origin;
  }
  return {
    base: './',
    plugins: [react(), csp(authOrigin)],
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
  };
});
