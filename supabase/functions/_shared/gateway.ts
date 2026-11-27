/** Narrow server-side boundary. No privileged key, no arbitrary downstream paths. */
export interface GatewayConfig {
  upstream: string;
  publishable: string;
  frontend: string;
}
export type Fetcher = typeof fetch;
const SPACES = ['school', 'practice', 'training', 'history', 'imports'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PAYLOAD_LIMIT = 8_388_608;

function headers(config: GatewayConfig): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': new URL(config.frontend).origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
}
function reply(config: GatewayConfig, body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: headers(config),
  });
}
function fail(config: GatewayConfig, status: number, message: string): Response {
  return reply(config, { message }, status);
}
function allowOrigin(request: Request, config: GatewayConfig): Response | null {
  if (request.headers.get('origin') !== new URL(config.frontend).origin)
    return fail(config, 403, 'Origin not permitted');
  if (request.method === 'OPTIONS') return reply(config, null, 204);
  return null;
}
function bearer(request: Request): string | null {
  const value = request.headers.get('authorization');
  return value && value.length <= 16_384 && JWT.test(value) ? value : null;
}
function upstreamHeaders(config: GatewayConfig, authorization?: string | null): Headers {
  const result = new Headers({
    apikey: config.publishable,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Supabase-Api-Version': '2024-01-01',
  });
  if (authorization) result.set('Authorization', authorization);
  return result;
}
async function body(request: Request, limit: number): Promise<string> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new Error('content-type');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('size');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function route(request: Request, functionName: string): string {
  const path = new URL(request.url).pathname;
  const root = `/functions/v1/${functionName}`;
  // Edge Runtime may strip /functions/v1 on its internal router.
  for (const prefix of [root, `/${functionName}`]) {
    if (path === prefix || path.startsWith(prefix + '/')) return path.slice(prefix.length) || '/';
  }
  return '';
}

export async function authGateway(
  request: Request,
  config: GatewayConfig,
  send: Fetcher = fetch,
): Promise<Response> {
  const origin = allowOrigin(request, config);
  if (origin) return origin;
  const path = route(request, 'goban-auth');
  const input = new URL(request.url);
  const method = request.method;
  const targets: Record<string, readonly string[]> = {
    '/token': ['POST'],
    '/signup': ['POST'],
    '/recover': ['POST'],
    '/user': ['GET', 'PUT'],
    '/logout': ['POST'],
  };
  if (!targets[path]?.includes(method)) return fail(config, 404, 'Route not found');
  const target = new URL(`${config.upstream}/auth/v1${path}`);
  const requiresUser = path === '/user' || path === '/logout';
  const authorization = requiresUser ? bearer(request) : null;
  if (requiresUser && !authorization) return fail(config, 401, 'Authentication required');
  for (const [key, value] of input.searchParams) {
    const valid =
      (path === '/token' &&
        key === 'grant_type' &&
        ['password', 'refresh_token', 'pkce'].includes(value)) ||
      ((path === '/signup' || path === '/recover') &&
        key === 'redirect_to' &&
        value === config.frontend) ||
      (path === '/logout' && key === 'scope' && value === 'local');
    if (!valid || target.searchParams.has(key)) return fail(config, 400, 'Invalid query');
    target.searchParams.set(key, value);
  }
  if ((path === '/signup' || path === '/recover') && !target.searchParams.has('redirect_to'))
    return fail(config, 400, 'Redirect required');
  if (path === '/logout' && target.searchParams.get('scope') !== 'local')
    return fail(config, 400, 'Invalid logout scope');
  if (path === '/token' && !target.searchParams.has('grant_type'))
    return fail(config, 400, 'Invalid grant');
  let payload: string | undefined;
  try {
    if (method !== 'GET' && path !== '/logout') {
      payload = await body(request, 16_384);
      const value: unknown = JSON.parse(payload);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid body');
    }
  } catch {
    return fail(config, 400, 'Invalid request');
  }
  try {
    const result = await send(target, {
      method,
      headers: upstreamHeaders(config, authorization),
      body: payload,
      redirect: 'error',
    });
    if (result.status === 204) return reply(config, null, 204);
    const output: unknown = await result.json();
    return reply(config, output, result.status);
  } catch {
    return fail(config, 503, 'Authentication unavailable');
  }
}

export async function progressGateway(
  request: Request,
  config: GatewayConfig,
  send: Fetcher = fetch,
): Promise<Response> {
  const origin = allowOrigin(request, config);
  if (origin) return origin;
  if (
    route(request, 'goban-progress') !== '/' ||
    !['GET', 'PUT'].includes(request.method) ||
    new URL(request.url).search
  )
    return fail(config, 404, 'Route not found');
  const authorization = bearer(request);
  if (!authorization) return fail(config, 401, 'Authentication required');
  try {
    const userResult = await send(`${config.upstream}/auth/v1/user`, {
      headers: upstreamHeaders(config, authorization),
      redirect: 'error',
    });
    if (!userResult.ok) return fail(config, 401, 'Authentication required');
    const user = (await userResult.json()) as { id?: string; is_anonymous?: boolean };
    if (!user.id || !UUID.test(user.id) || user.is_anonymous)
      return fail(config, 403, 'Account required');
    const target = new URL(`${config.upstream}/rest/v1/user_progress`);
    const authHeaders = upstreamHeaders(config, authorization);
    target.searchParams.set('user_id', `eq.${user.id}`);
    if (request.method === 'GET') {
      target.searchParams.set('select', 'space,payload,revision');
      const result = await send(target, { headers: authHeaders, redirect: 'error' });
      if (!result.ok) return fail(config, 503, 'Progress unavailable');
      return reply(config, await result.json());
    }
    let input: { space?: unknown; payload?: unknown; revision?: unknown };
    try {
      input = JSON.parse(await body(request, 16_777_216));
    } catch {
      return fail(config, 400, 'Invalid request');
    }
    if (
      !input ||
      Object.keys(input).sort().join(',') !== 'payload,revision,space' ||
      typeof input.space !== 'string' ||
      !SPACES.includes(input.space) ||
      typeof input.payload !== 'string' ||
      new TextEncoder().encode(input.payload).byteLength > PAYLOAD_LIMIT ||
      typeof input.revision !== 'number' ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      input.revision >= 2_147_483_647
    )
      return fail(config, 400, 'Invalid progress');
    const { space, payload, revision } = input;
    target.searchParams.set('select', 'revision');
    authHeaders.set('Prefer', 'return=representation');
    let data: Record<string, unknown>;
    if (revision === 0) {
      target.searchParams.delete('user_id');
      data = { user_id: user.id, space, payload, revision: 1 };
    } else {
      target.searchParams.set('space', `eq.${space}`);
      target.searchParams.set('revision', `eq.${revision}`);
      data = { payload, revision: revision + 1 };
    }
    const result = await send(target, {
      method: revision === 0 ? 'POST' : 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(data),
      redirect: 'error',
    });
    if (result.status === 409) return fail(config, 409, 'Progress conflict');
    if (!result.ok) return fail(config, 503, 'Progress unavailable');
    const rows = (await result.json()) as { revision: number }[];
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.revision !== revision + 1)
      return fail(config, 409, 'Progress conflict');
    return reply(config, { revision: rows[0].revision });
  } catch {
    return fail(config, 503, 'Progress unavailable');
  }
}
