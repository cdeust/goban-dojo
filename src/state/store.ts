import { create } from 'zustand';
import {
  buildTimeline,
  decodeMoves,
  decodePoints,
  type Dataset,
  type GameRecord,
  type Timeline,
} from '../domain/game.ts';

export type ViewName = 'joueur' | 'trois-quarts' | 'dessus';
export type PanelName = 'recit' | 'parties' | null;

/** Coups par seconde proposés à la lecture. */
export const SPEEDS = [0.5, 1, 2, 4, 8] as const;

interface State {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  dataset: Dataset | null;
  /** Index de la partie courante dans dataset.games. */
  gameIndex: number;
  /** Nombre de coups joués sur le goban (0 = position initiale). */
  move: number;
  playing: boolean;
  speed: number;
  /** Enchaîner automatiquement sur la partie suivante. */
  continuous: boolean;
  view: ViewName;
  showNumbers: boolean;
  sound: boolean;
  /** L'écran d'ouverture a été franchi. */
  entered: boolean;
  panel: PanelName;
  chapterIndex: number;

  load: () => Promise<void>;
  enter: () => void;
  selectGame: (index: number, opts?: { play?: boolean; move?: number }) => void;
  setMove: (move: number) => void;
  step: (delta: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setView: (view: ViewName) => void;
  toggle: (key: 'showNumbers' | 'sound' | 'continuous') => void;
  setPanel: (panel: PanelName) => void;
  setChapter: (index: number) => void;
}

const timelines = new WeakMap<GameRecord, Timeline>();

export function timelineOf(game: GameRecord): Timeline {
  let t = timelines.get(game);
  if (!t) {
    t = buildTimeline(decodePoints(game.setupBlack), decodeMoves(game.moves));
    timelines.set(game, t);
  }
  return t;
}

export const moveCount = (game: GameRecord): number => game.moves.length / 3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const isCoord = (s: string, i: number): boolean => {
  const a = s.charCodeAt(i);
  const b = s.charCodeAt(i + 1);
  return a >= 97 && a <= 115 && b >= 97 && b <= 115; // « a » à « s »
};

/** Triplets couleur + coordonnée (« bqd ») ou passe (« b-- »). */
function isMoveString(s: string): boolean {
  if (s.length % 3 !== 0) return false;
  for (let i = 0; i < s.length; i += 3) {
    const c = s.charAt(i);
    if (c !== 'b' && c !== 'w') return false;
    if (!isCoord(s, i + 1) && s.slice(i + 1, i + 3) !== '--') return false;
  }
  return true;
}

function isPointString(s: string): boolean {
  if (s.length % 2 !== 0) return false;
  for (let i = 0; i < s.length; i += 2) if (!isCoord(s, i)) return false;
  return true;
}

/** Les données sont servies par notre origine, mais on les valide avant de s'y fier. */
function isDataset(value: unknown): value is Dataset {
  if (typeof value !== 'object' || value === null) return false;
  const games = (value as { games?: unknown }).games;
  return (
    Array.isArray(games) &&
    games.length > 0 &&
    games.every(
      (g: unknown) =>
        typeof g === 'object' &&
        g !== null &&
        typeof (g as GameRecord).id === 'string' &&
        typeof (g as GameRecord).moves === 'string' &&
        typeof (g as GameRecord).setupBlack === 'string' &&
        isMoveString((g as GameRecord).moves) &&
        isPointString((g as GameRecord).setupBlack),
    )
  );
}

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  dataset: null,
  gameIndex: 0,
  move: 0,
  playing: false,
  speed: 1,
  continuous: true,
  view: 'trois-quarts',
  showNumbers: false,
  sound: true,
  entered: false,
  panel: null,
  chapterIndex: 0,

  load: async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/games.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!isDataset(json)) throw new Error('format de données inattendu');
      const first = json.games.findIndex((g) => !g.dateSuspect);
      set({ dataset: json, status: 'ready', gameIndex: Math.max(0, first) });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  enter: () => set({ entered: true, panel: 'recit', view: 'joueur' }),

  selectGame: (index, opts) => {
    const games = get().dataset?.games;
    if (!games) return;
    const i = clamp(index, 0, games.length - 1);
    const game = games[i];
    if (!game) return;
    set({
      gameIndex: i,
      move: clamp(opts?.move ?? 0, 0, moveCount(game)),
      playing: opts?.play ?? false,
    });
  },

  setMove: (move) => {
    const game = get().dataset?.games[get().gameIndex];
    if (!game) return;
    set({ move: clamp(Math.round(move), 0, moveCount(game)) });
  },

  step: (delta) => {
    set({ playing: false });
    get().setMove(get().move + delta);
  },

  togglePlay: () => get().setPlaying(!get().playing),

  setPlaying: (playing) => {
    const game = get().dataset?.games[get().gameIndex];
    if (!game) return;
    // Relancer la lecture en fin de partie reprend depuis le début.
    if (playing && get().move >= moveCount(game)) set({ move: 0 });
    set({ playing });
  },

  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<State>),
  setPanel: (panel) => set({ panel }),
  setChapter: (index) => set({ chapterIndex: index }),
}));

export const useCurrentGame = (): GameRecord | null =>
  useStore((s) => s.dataset?.games[s.gameIndex] ?? null);
