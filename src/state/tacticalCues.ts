import { POINTS } from '../domain/board.ts';
import { reflectionsOf } from './reflections.ts';
import { displayOf, isEstimating, marksOf, showsEarRedMove, type useStore } from './store.ts';

/** Une palette commune au plateau 3D et aux légendes. */
export const TACTICAL_CUES = {
  atari: {
    color: '#ff6655',
    label: 'Atari',
    detail: 'Il ne reste qu’une liberté au groupe.',
  },
  capture: {
    color: '#ed477f',
    label: 'Capture',
    detail: 'Une pierre a été retirée à cet endroit.',
  },
  trap: {
    color: '#ffae4a',
    label: 'Shicho',
    detail: 'Une poursuite en escalier peut capturer ce groupe.',
  },
  connection: {
    color: '#54cec4',
    label: 'Connexion',
    detail: 'Le dernier coup relie des groupes.',
  },
  studyMove: {
    color: '#ffd978',
    label: 'Coup étudié',
    detail: 'Le dernier coup de la position étudiée.',
  },
  variation: {
    color: '#a2eaff',
    label: 'Coup de variante',
    detail: 'Ce coup prolonge la position dans la suite affichée.',
  },
  landmark: {
    color: '#6aabff',
    label: 'Coup remarquable',
    detail: 'Un repère du récit ou de la réflexion.',
  },
} as const;

export type Cue = keyof typeof TACTICAL_CUES;
type State = ReturnType<typeof useStore.getState>;

export function tacticalCueKey(state: State): string {
  if (!state.effects) return '';
  const game = state.dataset?.games[state.gameIndex];
  const shown = displayOf(state);
  if (!game || !shown) return '';
  const { timeline, move } = shown;
  const estimating = isEstimating(state);
  const variant =
    (estimating || state.mode === 'etudier') && state.variation.length
      ? timeline.stones
          .filter(
            ({ placedAt, capturedAt }) =>
              placedAt > state.move && placedAt <= move && capturedAt > move,
          )
          .map(({ point }) => point)
      : [];
  if (estimating) return variant.map((point) => `${point}:variation`).join(',');
  const mark = marksOf(state);
  const scenes = reflectionsOf(game);
  const anchor =
    state.variation.length === 0 &&
    ((state.mode === 'lecture' && !state.playing) || state.mode === 'reflechir')
      ? scenes.find(({ after }) => after === state.move)?.tactical
      : undefined;
  const cues = new Map<number, Cue>();
  function put(kind: Cue, points: readonly number[]): void {
    for (const p of points) if (p >= 0 && p < POINTS) cues.set(p, kind);
  }
  put('variation', variant);
  if (mark.threat.connects.length) put('connection', [mark.last, ...mark.threat.connects]);
  put('atari', mark.atari);
  put('trap', mark.trapped);
  put(
    'capture',
    (timeline.capturesAt[move] ?? []).map((index) => timeline.stones[index]?.point ?? -1),
  );
  if (state.mode === 'etudier' && !state.variation.length && state.studyMove === state.move)
    put('studyMove', [mark.last]);
  if (anchor) put('landmark', [...anchor.captures, ...anchor.atari]);
  if (
    showsEarRedMove(game, state.move, state.variation) ||
    (state.variation.length === 0 && scenes.some(({ tactical }) => tactical?.number === state.move))
  ) {
    put('landmark', [mark.last]);
  }
  // Une seule couleur par intersection ; clé stable pour ne pas rejouer le fondu sans changement.
  return [...cues].map(([point, kind]) => `${point}:${kind}`).join(',');
}

export function parseTacticalCueKey(key: string): { point: number; kind: Cue }[] {
  if (!key) return [];
  return key.split(',').map((entry) => {
    const [point, kind] = entry.split(':') as [string, Cue];
    return { point: Number(point), kind };
  });
}
