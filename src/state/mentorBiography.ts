export type WikiLanguage = 'fr' | 'en';

export interface Biography {
  language: WikiLanguage;
  title: string;
  introduction: string;
  revision: number;
}

const wikiOrigin = (language: WikiLanguage) =>
  language === 'en' ? 'https://en.wikipedia.org' : 'https://fr.wikipedia.org';

/** Un titre à la fois. L’API et les liens ne dépendent jamais d’une URL renvoyée dans l’article. */
export async function findBiography(
  title: string,
  language: WikiLanguage,
  signal: AbortSignal,
): Promise<Biography | null> {
  const query = title.trim();
  if (!query || query.includes('|') || query.startsWith('\u001f')) return null;
  const url = new URL('/w/api.php', wikiOrigin(language));
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    prop: 'extracts|info|pageprops',
    ppprop: 'disambiguation',
    exintro: '1',
    explaintext: '1',
    titles: query,
  }).toString();
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Wikipédia indisponible');
  const payload = await response.json();
  if (payload.error || !Array.isArray(payload.query?.pages))
    throw new Error('Réponse Wikipédia invalide');
  const [page] = payload.query.pages;
  if (!page || page.missing || page.ns !== 0 || page.pageprops?.disambiguation !== undefined)
    return null;
  const introduction = typeof page.extract === 'string' ? page.extract.trim() : '';
  if (
    !introduction ||
    typeof page.title !== 'string' ||
    !Number.isSafeInteger(page.lastrevid) ||
    page.lastrevid <= 0
  )
    return null;
  return { language, title: page.title, introduction, revision: page.lastrevid };
}

export function sourceOf(bio: Biography) {
  return wikiOrigin(bio.language) + '/w/index.php?oldid=' + bio.revision;
}

const storageKey = (name: string) =>
  'goban.mentor.v1.' + name.trim().normalize('NFC').toLocaleLowerCase('fr');

export function savedBiography(name: string): Biography | null {
  try {
    const b = JSON.parse(localStorage.getItem(storageKey(name)) ?? 'null');
    if (
      b &&
      (b.language === 'fr' || b.language === 'en') &&
      typeof b.title === 'string' &&
      typeof b.introduction === 'string' &&
      Number.isSafeInteger(b.revision) &&
      b.revision > 0
    )
      return b;
  } catch {
    // La chronologie des parties reste accessible avec le stockage privé désactivé.
  }
  return null;
}

export function saveBiography(name: string, bio: Biography | null): void {
  if (bio) localStorage.setItem(storageKey(name), JSON.stringify(bio));
  else localStorage.removeItem(storageKey(name));
}
