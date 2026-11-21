import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SGF_LENGTH } from '../domain/sgf.ts';
import type { GameRecord } from '../domain/game.ts';
import { CHAPTERS, chapterIndexOf, gamesOfChapter } from '../story/chapters.ts';
import { formatDate, outcomeFor, prettyName } from '../story/format.ts';
import { moveCount, useStore } from '../state/store.ts';
import { mentorsOf, type Mentor } from '../story/mentors.ts';
import { MentorStory } from './MentorStory.tsx';
import { IconClose, IconPlay } from './icons.tsx';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Volet latéral : le récit chapitre par chapitre, ou la liste complète des parties. */
export function Panel() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const [storyChoice, setStoryChoice] = useState('');
  const games = useStore((s) => s.dataset?.games);
  const mentors = useMemo(() => mentorsOf(games ?? []), [games]);
  const studying = useStore((s) => s.mode === 'etudier');
  return (
    <AnimatePresence initial={false}>
      {panel && (
        <motion.aside
          id="panel"
          className="panel"
          aria-label={panel === 'recit' ? 'Récit' : 'Parties'}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <div className="panel__tabs">
            <button
              type="button"
              className="tab"
              aria-pressed={panel === 'recit'}
              onClick={() => setPanel('recit')}
            >
              Récit
            </button>
            <button
              type="button"
              className="tab"
              aria-pressed={panel === 'parties'}
              onClick={() => setPanel('parties')}
            >
              Parties
            </button>
            {!studying && (
              <button
                type="button"
                className="tab tab--study"
                onClick={() => useStore.getState().setMode('etudier')}
              >
                Étudier cette partie
              </button>
            )}
            <button
              type="button"
              className="icon-button panel__close"
              aria-label="Fermer le volet"
              onClick={() => setPanel(null)}
            >
              <IconClose />
            </button>
          </div>
          {panel === 'recit' ? (
            <Story mentors={mentors} choice={storyChoice} onChoose={setStoryChoice} />
          ) : (
            <Library
              hasMentors={mentors.length > 0}
              onBrowsePlayers={() => {
                setStoryChoice('choose');
                setPanel('recit');
              }}
            />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Story({
  mentors,
  choice,
  onChoose,
}: {
  mentors: Mentor[];
  choice: string;
  onChoose: (key: string) => void;
}) {
  const games = useStore((s) => s.dataset?.games);
  const chapterIndex = useStore((s) => s.chapterIndex);
  const gameIndex = useStore((s) => s.gameIndex);
  const setChapter = useStore((s) => s.setChapter);
  const selectGame = useStore((s) => s.selectGame);
  const setPanel = useStore((s) => s.setPanel);
  const chapter = CHAPTERS[chapterIndex];
  const scroller = useRef<HTMLDivElement>(null);
  const selected =
    choice || (games?.[gameIndex]?.imported && mentors.length ? 'choose' : 'history');
  const mentor = mentors.find((player) => 'player:' + player.key === selected);

  const inChapter = useMemo(
    () => (games ? gamesOfChapter(games, chapterIndex) : []),
    [games, chapterIndex],
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [chapterIndex, selected]);

  if (!chapter || !games) return null;

  const go = (index: number): void => {
    setChapter(index);
    const first = gamesOfChapter(games, index)[0];
    if (first) selectGame(games.indexOf(first));
    else {
      // Chapitre sans partie : le goban reste vide.
      useStore.getState().setPlaying(false);
      useStore.getState().setMove(0);
    }
  };

  return (
    <div className="panel__body" ref={scroller}>
      <div className="story-picker">
        {mentors.length > 0 && (
          <label>
            Joueur du récit
            <select value={selected} onChange={(event) => onChoose(event.target.value)}>
              <option value="choose">Choisir un joueur</option>
              <option value="history">Hon’inbō Shūsaku · récit historique</option>
              <optgroup label="Joueurs de vos SGF">
                {mentors.map((player) => (
                  <option key={player.key} value={'player:' + player.key}>
                    {player.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}
        <button type="button" className="link" onClick={() => setPanel('parties')}>
          Importer les parties de mon mentor
        </button>
      </div>
      {mentor ? (
        <MentorStory mentor={mentor} />
      ) : selected === 'choose' && mentors.length ? (
        <p>Choisissez le nom de votre mentor pour retrouver ses parties importées.</p>
      ) : (
        <>
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={chapter.id}
              className="chapter"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <p className="chapter__index">
                Chapitre {ROMAN[chapterIndex]} <span aria-hidden="true">·</span>{' '}
                {chapter.from === chapter.to ? chapter.from : `${chapter.from} – ${chapter.to}`}
              </p>
              <p className="chapter__kanji" lang="ja" aria-hidden="true">
                {chapter.kanji}
              </p>
              <p className="chapter__reading">{chapter.reading}</p>
              <h2 className="chapter__title">{chapter.title}</h2>
              {chapter.paragraphs.map((p) => (
                <p key={p} className="chapter__text">
                  {p}
                </p>
              ))}

              {chapter.featured.length > 0 && (
                <>
                  <h3 className="chapter__sub">À revoir</h3>
                  <ul className="featured">
                    {chapter.featured.map((f) => {
                      const index = games.findIndex((g) => g.id === f.gameId);
                      if (index < 0) return null;
                      return (
                        <li key={f.gameId + f.label}>
                          <button
                            type="button"
                            className="featured__button"
                            aria-current={index === gameIndex ? 'true' : undefined}
                            onClick={() => selectGame(index, { play: true })}
                          >
                            <IconPlay />
                            <span>{f.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {inChapter.length > 0 && (
                <button type="button" className="link" onClick={() => setPanel('parties')}>
                  Les {inChapter.length} parties de ces années →
                </button>
              )}
            </motion.article>
          </AnimatePresence>

          <nav className="chapter-nav" aria-label="Chapitres">
            <button
              type="button"
              className="chip"
              disabled={chapterIndex === 0}
              onClick={() => go(chapterIndex - 1)}
            >
              ← Précédent
            </button>
            <button
              type="button"
              className="chip chip--accent"
              disabled={chapterIndex === CHAPTERS.length - 1}
              onClick={() => go(chapterIndex + 1)}
            >
              Suivant →
            </button>
          </nav>
        </>
      )}
    </div>
  );
}

function Row({ game, index, current }: { game: GameRecord; index: number; current: boolean }) {
  const selectGame = useStore((s) => s.selectGame);
  const outcome = outcomeFor(game);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className="row"
        aria-current={current ? 'true' : undefined}
        onClick={() => selectGame(index, { play: true })}
      >
        <span className="row__mark" title={outcome.label}>
          <span aria-hidden="true">{outcome.mark}</span>
          <span className="sr-only">{outcome.label}</span>
        </span>
        <span className="row__main">
          <span className="row__opponent">
            {game.imported
              ? prettyName(game.black) + ' — ' + prettyName(game.white)
              : prettyName(game.opponent)}
          </span>
          <span className="row__meta">
            {game.imported && game.sessions
              ? formatDate(game.sessions)
              : game.date && <time dateTime={game.date}>{formatDate(game.date)}</time>}
            {!game.imported && ' · ' + (game.shusaku === 'B' ? 'noir' : 'blanc')}
            {game.handicap > 0 && ` · ${game.handicap} p.`}
            {game.rengo && ' · rengo'}
            {(game.date || !game.imported || game.handicap > 0) && ' · '}
            {moveCount(game)} coups
          </span>
          {game.event && <span className="row__event">{game.event}</span>}
        </span>
      </button>
    </li>
  );
}

function ImportGame() {
  const importGame = useStore((s) => s.importGame);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function read(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > MAX_SGF_LENGTH)
        throw new Error('Choisissez un fichier SGF de 512 Kio maximum.');
      const bytes = await file.arrayBuffer();
      const probe = new TextDecoder('windows-1252').decode(bytes);
      const charset = /[;\s\]]CA\[([\w-]+)\]/.exec(probe)?.[1] ?? 'utf-8';
      let text: string;
      try {
        text = new TextDecoder(charset, { fatal: true }).decode(bytes);
      } catch {
        throw new Error('Impossible de lire l’encodage de ce fichier SGF.');
      }
      importGame(text, file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossible d’importer ce kifu.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="library-import">
      <label htmlFor="import-sgf">Importer un fichier SGF</label>
      <input
        type="file"
        id="import-sgf"
        accept=".sgf,application/x-go-sgf"
        aria-describedby="import-detail"
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void read(file);
        }}
      />
      <p id="import-detail">Goban 19 × 19. Les parties sont conservées dans ce navigateur.</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Library({
  hasMentors,
  onBrowsePlayers,
}: {
  hasMentors: boolean;
  onBrowsePlayers: () => void;
}) {
  const games = useStore((s) => s.dataset?.games);
  const gameIndex = useStore((s) => s.gameIndex);
  const [query, setQuery] = useState('');
  const [resignedOnly, setResignedOnly] = useState(false);

  const groups = useMemo(() => {
    if (!games) return [];
    const q = query.trim().toLowerCase();
    const matches = (g: GameRecord): boolean =>
      (!resignedOnly || g.result.resign === true) &&
      (q === '' ||
        `${prettyName(g.black)} ${prettyName(g.white)} ${g.date} ${g.event ?? ''} ${g.place ?? ''}`
          .toLowerCase()
          .includes(q));
    const imports = games.flatMap((g, i) => (g.imported && matches(g) ? [{ g, i }] : []));
    const out = CHAPTERS.map((c, ci) => ({
      key: c.id,
      title: c.title,
      years: c.from === c.to ? String(c.from) : `${c.from} – ${c.to}`,
      items: games
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => chapterIndexOf(g) === ci && matches(g)),
    }));
    return [{ key: 'imports', title: 'Mes parties', years: '', items: imports }, ...out].filter(
      (grp) => grp.items.length > 0,
    );
  }, [games, query, resignedOnly]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="panel__body">
      <ImportGame />
      {hasMentors && (
        <button type="button" className="link" onClick={onBrowsePlayers}>
          Parcourir les joueurs importés
        </button>
      )}
      <label className="search">
        <span className="sr-only">Chercher un joueur, une année, un lieu</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Joueur, année, lieu…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="chip">
        <input
          type="checkbox"
          checked={resignedOnly}
          onChange={(e) => setResignedOnly(e.target.checked)}
        />
        Parties terminées par abandon
      </label>
      <p className="library__count" role="status">
        {total} partie{total > 1 ? 's' : ''}
        <span className="library__legend" aria-hidden="true">
          {' '}
          · ○ victoire ● défaite ＝ jigo
        </span>
      </p>
      {groups.map((grp) => (
        <section key={grp.key} className="group">
          <h3 className="group__title">
            {grp.title} {grp.years && <span className="group__years">{grp.years}</span>}
          </h3>
          <ul className="rows">
            {grp.items.map(({ g, i }) => (
              <Row key={g.id} game={g} index={i} current={i === gameIndex} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
