import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PROGRESS_SPACES,
  type ProgressBackend,
  type ProgressEntry,
  type ProgressSpace,
} from './accountPersistence.ts';

export async function createAccountClient(
  url: string | undefined,
  key: string | undefined,
  allowLocalTest = false,
): Promise<SupabaseClient | null> {
  if (!url || !key || !key.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    const localTest =
      allowLocalTest && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    if ((!localTest && parsed.protocol !== 'https:') || parsed.origin !== url.replace(/\/$/, ''))
      return null;
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(parsed.origin, key, { auth: { flowType: 'pkce' } });
  } catch {
    return null;
  }
}

export function progressBackend(client: SupabaseClient, userId: string): ProgressBackend {
  return {
    async read(): Promise<ProgressEntry[]> {
      const { data, error } = await client
        .from('user_progress')
        .select('space,payload,revision')
        .eq('user_id', userId);
      if (error) throw new Error('Impossible de récupérer le carnet.');
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
      const table = client.from('user_progress');
      const result =
        expectedRevision === 0
          ? await table
              .insert({ user_id: userId, space, payload, revision: 1 })
              .select('revision')
              .single()
          : await table
              .update({ payload, revision: expectedRevision + 1 })
              .eq('user_id', userId)
              .eq('space', space)
              .eq('revision', expectedRevision)
              .select('revision')
              .single();
      if (result.error) throw new Error('Synchronisation interrompue.');
      return Number(result.data.revision);
    },
  };
}
