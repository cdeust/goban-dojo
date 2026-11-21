import { afterEach, expect, it, vi } from 'vitest';
import {
  findBiography,
  saveBiography,
  savedBiography,
  sourceOf,
} from '../src/state/mentorBiography.ts';

afterEach(() => vi.unstubAllGlobals());

const signal = new AbortController().signal;
const page = {
  ns: 0,
  title: 'Go Seigen',
  lastrevid: 42,
  extract: 'Premier paragraphe.\n\nUn second paragraphe.',
};

it('cherche uniquement le nom saisi et lie la notice à la révision lue', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ query: { pages: [page] } }));
  vi.stubGlobal('fetch', request);
  const bio = await findBiography(' Go Seigen ', 'fr', signal);
  const [url, init] = request.mock.calls[0]!;
  expect(url.origin + url.pathname).toBe('https://fr.wikipedia.org/w/api.php');
  expect(url.searchParams.get('titles')).toBe('Go Seigen');
  expect(init).toMatchObject({ signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  expect(bio?.introduction).toBe(page.extract);
  expect(sourceOf(bio!)).toBe('https://fr.wikipedia.org/w/index.php?oldid=42');
});

it.each([{ missing: true }, { ns: 1 }, { pageprops: { disambiguation: '' } }, { extract: '' }])(
  'écarte une fiche absente, ambiguë ou vide',
  async (fields) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ query: { pages: [{ ...page, ...fields }] } })),
    );
    expect(await findBiography('Nom', 'en', signal)).toBeNull();
  },
);

it('distingue une panne de Wikipédia d’un nom inconnu', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'readonly' } })));
  await expect(findBiography('Nom', 'en', signal)).rejects.toThrow();
});

it('mémorise la notice confirmée pour ce joueur et permet de la retirer', () => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  });
  const bio = {
    language: 'en' as const,
    title: page.title,
    introduction: page.extract,
    revision: page.lastrevid,
  };
  saveBiography('Go Seigen', bio);
  expect(savedBiography('go seigen')).toEqual(bio);
  expect(savedBiography('Autre')).toBeNull();
  saveBiography('Go Seigen', null);
  expect(savedBiography('Go Seigen')).toBeNull();
});
