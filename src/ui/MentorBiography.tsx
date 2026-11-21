import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  findBiography,
  savedBiography,
  saveBiography,
  sourceOf,
  type Biography,
  type WikiLanguage,
} from '../state/mentorBiography.ts';

function Excerpt({ bio }: { bio: Biography }) {
  const [opening, ...following] = bio.introduction.split(/\n+/).filter(Boolean);
  return (
    <>
      <p lang={bio.language}>{opening}</p>
      {following.length > 0 && (
        <details>
          <summary>Suite de la biographie</summary>
          {following.map((paragraph, i) => (
            <p key={i} lang={bio.language}>
              {paragraph}
            </p>
          ))}
        </details>
      )}
      <p className="mode__note">
        <a href={sourceOf(bio)} target="_blank" rel="noopener noreferrer">
          {bio.title} · Wikipédia ({bio.language})
        </a>
        {' · '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY-SA 4.0
        </a>
      </p>
    </>
  );
}

function BiographyFor({ name }: { name: string }) {
  const [saved, setSaved] = useState(() => savedBiography(name));
  const [title, setTitle] = useState(name);
  const [language, setLanguage] = useState<WikiLanguage>('fr');
  const [candidate, setCandidate] = useState<Biography | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function resetSearch() {
    active.current?.abort();
    setPending(false);
    setCandidate(null);
    setMessage('');
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    resetSearch();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    try {
      const bio = await findBiography(title, language, controller.signal);
      if (controller.signal.aborted) return;
      setCandidate(bio);
      if (!bio)
        setMessage(
          'Aucune notice précise à ce titre. Essayez une autre orthographe ou la version anglaise.',
        );
    } catch {
      if (!controller.signal.aborted)
        setMessage('Wikipédia est inaccessible. Vous pouvez réessayer ou parcourir les parties.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function associate(bio: Biography | null) {
    resetSearch();
    try {
      saveBiography(name, bio);
    } catch {
      setMessage('Ce changement ne sera conservé que pour cette visite.');
    }
    setSaved(bio);
  }

  return (
    <section className="mentor-biography" aria-label="Biographie du mentor">
      {saved ? (
        <>
          <h3>Biographie</h3>
          <Excerpt bio={saved} />
          <button type="button" className="chip" onClick={() => associate(null)}>
            Dissocier la notice
          </button>
        </>
      ) : (
        <details>
          <summary>Associer une biographie</summary>
          <form onSubmit={(event) => void search(event)}>
            <label className="study__filter">
              Nom sur Wikipédia
              <input
                type="search"
                value={title}
                onChange={(event) => {
                  resetSearch();
                  setTitle(event.target.value);
                }}
                required
              />
            </label>
            <label className="study__filter">
              Édition de Wikipédia
              <select
                value={language}
                onChange={(event) => {
                  resetSearch();
                  setLanguage(event.target.value === 'en' ? 'en' : 'fr');
                }}
              >
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </select>
            </label>
            <p className="mode__note">La recherche transmet uniquement le nom saisi à Wikipédia.</p>
            <button type="submit" className="chip" disabled={!title.trim() || pending}>
              Chercher sur Wikipédia
            </button>
          </form>
          {candidate && (
            <>
              <h4>{candidate.title}</h4>
              <Excerpt bio={candidate} />
              <button
                type="button"
                className="chip chip--accent"
                onClick={() => associate(candidate)}
              >
                Associer cette notice à {name}
              </button>
            </>
          )}
        </details>
      )}
      {(pending || message) && <p role="status">{pending ? 'Recherche en cours…' : message}</p>}
    </section>
  );
}

export function MentorBiography({ name }: { name: string }) {
  return <BiographyFor key={name} name={name} />;
}
