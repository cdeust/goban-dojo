import type { GoTrueClient } from '@supabase/auth-js';
import {
  PROGRESS_SPACES,
  type ProgressBackend,
  type ProgressEntry,
  type ProgressSpace,
} from './accountPersistence.ts';

export interface AccountClient {
  auth: GoTrueClient;
  endpoint: string;
}

/** The browser knows only the gateway URL, never a Supabase API key. */
export async function createAccountClient(
  url: string | undefined,
  allowLocalTest = false,
): Promise<AccountClient | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const localTest =
      allowLocalTest && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    if ((!localTest && parsed.protocol !== 'https:') || parsed.origin !== url.replace(/\/$/, ''))
      return null;
    const { GoTrueClient } = await import('@supabase/auth-js');
    const endpoint = `${parsed.origin}/functions/v1`;
    return {
      endpoint,
      auth: new GoTrueClient({
        url: `${endpoint}/goban-auth`,
        flowType: 'pkce',
        storageKey: 'goban-dojo-auth-v1',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      }),
    };
  } catch {
    return null;
  }
}

export function progressBackend(client: AccountClient, userId: string): ProgressBackend {
  async function request(method: 'GET' | 'PUT', input?: unknown): Promise<unknown> {
    const {
      data: { session },
      error,
    } = await client.auth.getSession();
    if (error || !session || session.user.id !== userId) throw new Error('Session expirée.');
    const response = await fetch(`${client.endpoint}/goban-progress`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(input ? { 'Content-Type': 'application/json' } : {}),
      },
      body: input ? JSON.stringify(input) : undefined,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Synchronisation interrompue.');
    return response.json();
  }
  return {
    async read(): Promise<ProgressEntry[]> {
      const data = await request('GET');
      if (!Array.isArray(data)) throw new Error('Carnet invalide.');
      return data.flatMap((entry) =>
        PROGRESS_SPACES.includes(entry.space as ProgressSpace) && typeof entry.payload === 'string'
          ? [
              {
                space: entry.space as ProgressSpace,
                value: entry.payload,
                revision: Number(entry.revision),
              },
            ]
          : [],
      );
    },
    async write(space, payload, expectedRevision): Promise<number> {
      const result = (await request('PUT', { space, payload, revision: expectedRevision })) as {
        revision?: unknown;
      };
      if (typeof result.revision !== 'number' || result.revision !== expectedRevision + 1)
        throw new Error('Révision inattendue.');
      return result.revision;
    },
  };
}
