import { execFileSync } from 'node:child_process';

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
const env = { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey };
execFileSync('pnpm', ['exec', 'vite', 'build', '--mode', 'account-test'], {
  env,
  stdio: 'inherit',
});
execFileSync('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.accounts.config.ts'], {
  env: { ...env, SUPABASE_LOCAL_SECRET_KEY: secret },
  stdio: 'inherit',
});
