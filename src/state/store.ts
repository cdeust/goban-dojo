import { create } from 'zustand';
import { Board, PASS, SIZE, opposite, type Color } from '../domain/board.ts';
import {
  buildTimeline,
  decodeMoves,
  decodePoints,
  type Dataset,
  type GameRecord,
  type Move,
  type Timeline,
} from '../domain/game.ts';

export type ViewName = 'joueur' | 'trois-quarts' | 'dessus';
export type PanelName = 'recit' | 'parties' | null;
/**
 * lecture  : la partie se déroule seule ;
 * deviner  : on cherche soi-même le prochain coup de Shūsaku ;
 * explorer : on pose librement d'autres coups à partir de la position courante.
 */
export type Mode = 'lecture' | 'deviner' | 'explorer';

/** Zone du goban (bornes incluses) donnée en indice dans le mode « deviner ». */
export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type GuessResult =
  | { kind: 'exact'; points: number }
  | { kind: 'miss'; distance: number }
  | { kind: 'revealed'; point: number };

export interface GuessState {
  /** Essais manqués sur le coup en cours. */
  tries: number;
  /** Points déjà essayés à tort sur le coup en cours. */
  wrong: number[];
  zone: Zone | null;
  last: GuessResult | null;
  /** Bilan depuis le début de la partie. */
  asked: number;
  found: number;
  firstTry: number;
  points: number;
}

const emptyGuess = (): GuessState => ({
  tries: 0,
  wrong: [],
  zone: null,
  last: null,
  asked: 0,
  found: 0,
  firstTry: 0,
  points: 0,
});

/** Points accordés selon le nombre d'essais manqués avant de trouver. */
export const GUESS_POINTS = [3, 2, 1] as const;
/** Côté (en intersections) de la zone d'indice après le 1er puis le 2e essai manqué. */
export const HINT_SIZES = [9, 5] as const;
/** Nombre maximal de coups qu'on peut ajouter dans une exploration. */
export const MAX_VARIATION = 80;

/**
 * Zone carrée contenant la cible sans la centrer : sa position dépend de la cible de façon
 * déterministe, pour que le centre de la zone ne trahisse pas le coup.
 */
export function hintZone(target: number, size: number): Zone {
  const tx = target % SIZE;
  const ty = Math.floor(target / SIZE);
  const ox = (target * 7 + size * 3) % size;
  const oy = (target * 13 + size * 5) % size;
  const x0 = Math.min(SIZE - size, Math.max(0, tx - ox));
  const y0 = Math.min(SIZE - size, Math.max(0, ty - oy));
  return { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
}

/** Distance de Tchebychev entre deux intersections. */
export function pointDistance(a: number, b: number): number {
  return Math.max(
    Math.abs((a % SIZE) - (b % SIZE)),
    Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)),
  );
}

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
  mode: Mode;
  guess: GuessState;
  /** Coups ajoutés par l'utilisateur après le coup `move` de la partie (mode « explorer »). */
  variation: Move[];
  /** Message bref à l'utilisateur (coup refusé, etc.). */
  notice: string | null;

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
  setMode: (mode: Mode) => void;
  /** Clic sur une intersection du goban ; l'effet dépend du mode. */
  clickPoint: (point: number) => void;
  /** Mode « deviner » : demander un indice (compte comme un essai manqué). */
  hint: () => void;
  /** Mode « deviner » : montrer le coup et passer au suivant. */
  reveal: () => void;
  undoVariation: () => void;
  clearVariation: () => void;
}

/** Position affichée : la partie jusqu'au coup courant, plus l'exploration éventuelle. */
export interface Display {
  timeline: Timeline;
  move: number;
}

const variationTimelines = new WeakMap<Move[], Timeline>();

export function displayOf(
  s: Pick<State, 'dataset' | 'gameIndex' | 'move' | 'variation'>,
): Display | null {
  const game = s.dataset?.games[s.gameIndex];
  if (!game) return null;
  const base = timelineOf(game);
  if (s.variation.length === 0) return { timeline: base, move: s.move };
  let t = variationTimelines.get(s.variation);
  if (!t) {
    t = buildTimeline(decodePoints(game.setupBlack), [
      ...base.moves.slice(0, s.move),
      ...s.variation,
    ]);
    variationTimelines.set(s.variation, t);
  }
  return { timeline: t, move: s.move + s.variation.length };
}

/** Couleur du prochain coup dans la position affichée. */
export function nextColor(s: Pick<State, 'dataset' | 'gameIndex' | 'move' | 'variation'>): Color {
  const game = s.dataset?.games[s.gameIndex];
  if (!game) return 'B';
  const last = s.variation.at(-1);
  if (last) return opposite(last.color);
  const moves = timelineOf(game).moves;
  const next = moves[s.move];
  if (next) return next.color;
  const previous = moves[s.move - 1];
  return previous ? opposite(previous.color) : game.handicap > 0 ? 'W' : 'B';
}

/** Goban dans la position affichée (pour tester la légalité d'un coup). */
function boardOf(s: Pick<State, 'dataset' | 'gameIndex' | 'move' | 'variation'>): Board | null {
  const game = s.dataset?.games[s.gameIndex];
  if (!game) return null;
  const board = new Board();
  for (const p of decodePoints(game.setupBlack)) board.setup(p, 'B');
  for (const m of timelineOf(game).moves.slice(0, s.move)) board.play(m.color, m.point);
  for (const m of s.variation) board.play(m.color, m.point);
  return board;
}

const ILLEGAL_LABEL = {
  occupied: 'Cette intersection est occupée.',
  suicide: 'Coup interdit : la pierre n’aurait aucune liberté.',
  ko: 'Coup interdit : reprise immédiate du ko.',
} as const;

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
  mode: 'lecture',
  guess: emptyGuess(),
  variation: [],
  notice: null,

  load: async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/games.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!isDataset(json)) throw new Error('format de données inattendu');
      set({ dataset: json, status: 'ready', gameIndex: 0 });
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
    const mode = get().mode;
    set({
      gameIndex: i,
      move: clamp(opts?.move ?? 0, 0, moveCount(game)),
      // On ne lance pas la lecture automatique par-dessus un mode interactif.
      playing: mode === 'lecture' ? (opts?.play ?? false) : false,
      variation: [],
      guess: emptyGuess(),
      notice: null,
    });
  },

  setMove: (move) => {
    const game = get().dataset?.games[get().gameIndex];
    if (!game) return;
    const g = get().guess;
    set({
      move: clamp(Math.round(move), 0, moveCount(game)),
      // Changer de position abandonne l'exploration et l'essai en cours, pas le bilan.
      variation: [],
      guess: { ...g, tries: 0, wrong: [], zone: null },
      notice: null,
    });
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
    // La lecture automatique ramène au mode « lecture ».
    set(playing ? { playing, mode: 'lecture', variation: [], notice: null } : { playing });
  },

  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<State>),
  setPanel: (panel) => set({ panel }),
  setChapter: (index) => set({ chapterIndex: index }),

  setMode: (mode) =>
    set((s) => ({
      mode,
      playing: false,
      variation: [],
      notice: null,
      guess:
        mode === 'deviner'
          ? emptyGuess()
          : { ...s.guess, tries: 0, wrong: [], zone: null, last: null },
    })),

  clickPoint: (point) => {
    const s = get();
    const game = s.dataset?.games[s.gameIndex];
    if (!game || point < 0 || point >= SIZE * SIZE) return;

    if (s.mode === 'explorer') {
      if (s.variation.length >= MAX_VARIATION) {
        set({ notice: `Une exploration est limitée à ${MAX_VARIATION} coups.` });
        return;
      }
      const board = boardOf(s);
      if (!board) return;
      const color = nextColor(s);
      const res = board.play(color, point);
      if (res.illegal) {
        set({ notice: ILLEGAL_LABEL[res.illegal] });
        return;
      }
      set({ variation: [...s.variation, { color, point }], notice: null });
      return;
    }

    if (s.mode !== 'deviner') return;
    const target = timelineOf(game).moves[s.move];
    if (!target || target.color !== game.shusaku || target.point === PASS) return;
    if (boardOf(s)?.get(point)) return;
    const g = s.guess;
    if (point === target.point) {
      const points = GUESS_POINTS[g.tries] ?? 0;
      set({
        guess: {
          tries: 0,
          wrong: [],
          zone: null,
          last: { kind: 'exact', points },
          asked: g.asked + 1,
          found: g.found + 1,
          firstTry: g.firstTry + (g.tries === 0 ? 1 : 0),
          points: g.points + points,
        },
        move: s.move + 1,
      });
      return;
    }
    if (g.wrong.includes(point)) return;
    const tries = g.tries + 1;
    const size = HINT_SIZES[tries - 1];
    if (size === undefined) {
      get().reveal();
      return;
    }
    set({
      guess: {
        ...g,
        tries,
        wrong: [...g.wrong, point],
        zone: hintZone(target.point, size),
        last: { kind: 'miss', distance: pointDistance(point, target.point) },
      },
    });
  },

  hint: () => {
    const s = get();
    const game = s.dataset?.games[s.gameIndex];
    const target = game ? timelineOf(game).moves[s.move] : undefined;
    if (s.mode !== 'deviner' || !game || !target || target.color !== game.shusaku) return;
    const tries = s.guess.tries + 1;
    const size = HINT_SIZES[tries - 1];
    if (size === undefined) {
      get().reveal();
      return;
    }
    set({ guess: { ...s.guess, tries, zone: hintZone(target.point, size), last: null } });
  },

  reveal: () => {
    const s = get();
    const game = s.dataset?.games[s.gameIndex];
    const target = game ? timelineOf(game).moves[s.move] : undefined;
    if (s.mode !== 'deviner' || !game || !target || target.color !== game.shusaku) return;
    set({
      guess: {
        ...s.guess,
        tries: 0,
        wrong: [],
        zone: null,
        last: { kind: 'revealed', point: target.point },
        asked: s.guess.asked + 1,
      },
      move: s.move + 1,
    });
  },

  undoVariation: () => set((s) => ({ variation: s.variation.slice(0, -1), notice: null })),
  clearVariation: () => set({ variation: [], notice: null }),
}));

export const useCurrentGame = (): GameRecord | null =>
  useStore((s) => s.dataset?.games[s.gameIndex] ?? null);
