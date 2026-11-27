import { describe, expect, it, vi } from 'vitest';
import {
  authGateway,
  progressGateway,
  type GatewayConfig,
} from '../supabase/functions/_shared/gateway.ts';

const config: GatewayConfig = {
  upstream: 'https://db.example.test',
  frontend: 'https://dojo.example.test/',
  publishable: 'server-only-test-marker',
};
const origin = new URL(config.frontend).origin;
const user = '10000000-0000-4000-8000-000000000001';
const jwt = 'Bearer scoped.session.token';
function request(path: string, method = 'GET', payload?: unknown, authorization?: string) {
  return new Request(`https://gateway.example.test/functions/v1/${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

describe('gateway de compte', () => {
  it('authentifie via la route de connexion sans révéler la clé serveur', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ access_token: 'session-token' }));
    const result = await authGateway(
      request('goban-auth/token?grant_type=password', 'POST', {
        email: 'local@example.test',
        password: 'example-password',
      }),
      config,
      send,
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ access_token: 'session-token' });
    expect(String(send.mock.calls[0]?.[0])).toBe(
      config.upstream + '/auth/v1/token?grant_type=password',
    );
    expect(new Headers(send.mock.calls[0]?.[1]?.headers).get('apikey')).toBe(config.publishable);
    expect(result.headers.get('apikey')).toBeNull();
  });
  it('ne permet ni route hors contrat ni accès à la progression sans session', async () => {
    const send = vi.fn();
    expect((await authGateway(request('goban-auth/admin/users'), config, send)).status).toBe(404);
    expect((await progressGateway(request('goban-progress'), config, send)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it('utilise exclusivement le propriétaire vérifié et sa révision', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    send
      .mockResolvedValueOnce(Response.json({ id: user, is_anonymous: false }))
      .mockResolvedValueOnce(Response.json([{ revision: 4 }]));
    const result = await progressGateway(
      request('goban-progress', 'PUT', { space: 'school', payload: '{}', revision: 3 }, jwt),
      config,
      send,
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ revision: 4 });
    const target = new URL(String(send.mock.calls[1]?.[0]));
    expect(target.searchParams.get('user_id')).toBe(`eq.${user}`);
    expect(target.searchParams.get('revision')).toBe('eq.3');
    expect(new Headers(send.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(jwt);
  });
  it('refuse une révision périmée sans remplacer les données', async () => {
    const send = vi.fn(async () => Response.json({}));
    send
      .mockResolvedValueOnce(Response.json({ id: user, is_anonymous: false }))
      .mockResolvedValueOnce(Response.json([]));
    expect(
      (
        await progressGateway(
          request('goban-progress', 'PUT', { space: 'school', payload: '{}', revision: 3 }, jwt),
          config,
          send,
        )
      ).status,
    ).toBe(409);
  });
});
