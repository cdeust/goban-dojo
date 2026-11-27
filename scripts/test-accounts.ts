import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

// The test profile is disposable and loopback-only. Never use a hosted project's keys.
const raw = execFileSync('pnpm', ['dlx', 'supabase@3.4.0', 'status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const config = JSON.parse(raw) as Record<string, unknown>;
const url = config.API_URL;
const publicKey = config.PUBLISHABLE_KEY;
const secret = config.SECRET_KEY;
if (
  url !== 'http://127.0.0.1:55421' ||
  typeof publicKey !== 'string' ||
  !publicKey.startsWith('sb_publishable_') ||
  typeof secret !== 'string' ||
  !secret.startsWith('sb_secret_')
) {
  throw new Error(
    'Une instance locale Supabase avec clés locales publishable et secret est requise.',
  );
}
// No privileged value is passed to Vite. The test runner gets the local administrative key only.
const env = { ...process.env, VITE_GOBAN_API_URL: url };
execFileSync('pnpm', ['exec', 'vite', 'build', '--mode', 'account-test'], {
  env,
  stdio: 'inherit',
});
// Inspect generated assets without printing key material. Neither kind of real local key may be bundled.
for (const asset of readdirSync('dist/assets').filter((name) => name.endsWith('.js'))) {
  const content = readFileSync(`dist/assets/${asset}`, 'utf8');
  if (content.includes(publicKey) || content.includes(secret))
    throw new Error('Clé API présente dans le build.');
}
execFileSync('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.accounts.config.ts'], {
  env: { ...env, SUPABASE_LOCAL_SECRET_KEY: secret },
  stdio: 'inherit',
});
