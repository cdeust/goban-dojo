import type { GatewayConfig } from './gateway.ts';

export function loadConfig(): GatewayConfig {
  const upstream = Deno.env.get('SUPABASE_URL');
  const frontend = Deno.env.get('GOBAN_FRONTEND_URL');
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  const publishable =
    (keys ? JSON.parse(keys).default : undefined) ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (
    !upstream ||
    !frontend ||
    typeof publishable !== 'string' ||
    !publishable.startsWith('sb_publishable_')
  )
    throw new Error('Missing gateway configuration');
  const site = new URL(frontend);
  if (
    site.search ||
    site.hash ||
    site.username ||
    site.password ||
    (site.protocol !== 'https:' && !(site.protocol === 'http:' && site.hostname === '127.0.0.1'))
  )
    throw new Error('Invalid frontend configuration');
  return { upstream: upstream.replace(/\/$/, ''), publishable, frontend };
}
