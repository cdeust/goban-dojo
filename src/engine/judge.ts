/**
 * Jugement d'un coup par comparaison de « positions sœurs ».
 *
 * Le réseau est interrogé sans recherche arborescente. Pour noter un coup M dans une position P,
 * on compare l'avance estimée après M à celle qu'on obtient après chacun des coups que le réseau
 * préfère dans P : la perte de M est l'écart au meilleur de ces candidats.
 *
 * Précision mesurée de cette méthode (docs/MOTEUR.md) : erreur moyenne d'environ 2 points avec
 * le réseau b10c128. D'où des catégories larges plutôt qu'un chiffre au demi-point.
 */
import { opposite, type Color } from '../domain/board.ts';
import { topMoves, type Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';

/** Nombre de coups préférés du réseau auxquels on compare le coup joué. */
export const CANDIDATES = 5;
/** En deçà de cette perte (points), le coup est dans la marge d'erreur du réseau. */
export const GOOD_BELOW = 2;
/** À partir de cette perte (points), le coup est signalé comme une erreur probable. */
export const MISTAKE_FROM = 5;

export type Verdict = 'bon' | 'discutable' | 'erreur';

export interface Judgement {
  /** Points perdus par rapport au meilleur candidat du réseau (≥ 0). */
  loss: number;
  verdict: Verdict;
  /** Coup que le réseau estimait le meilleur. */
  best: number;
  /** Rang du coup jugé dans les préférences du réseau (1 = premier choix), 0 s'il n'y figure pas. */
  rank: number;
  /** Avance de Noir estimée après le coup jugé. */
  blackLeadAfter: number;
  blackWinrateAfter: number;
}

export type Evaluator = (positions: EnginePosition[]) => Promise<Evaluation[]>;

export const verdictOf = (loss: number): Verdict =>
  loss < GOOD_BELOW ? 'bon' : loss < MISTAKE_FROM ? 'discutable' : 'erreur';

const after = (p: EnginePosition, color: Color, point: number): EnginePosition => ({
  setupBlack: p.setupBlack,
  moves: [...p.moves, { color, point }],
  next: opposite(color),
});

/**
 * Juge chacun des coups `points` joués par le joueur au trait dans `position`.
 * Coût : 1 inférence pour la position, puis une par candidat et par coup jugé distinct.
 */
export async function judgeMoves(
  evaluate: Evaluator,
  position: EnginePosition,
  points: number[],
): Promise<Judgement[]> {
  const mover = position.next;
  const sign = mover === 'B' ? 1 : -1;
  const [root] = await evaluate([position]);
  if (!root) throw new Error('évaluation absente');
  const candidates = topMoves(root.policy, CANDIDATES);
  const ranked = topMoves(root.policy, 361);
  const all = [...new Set([...candidates, ...points])];
  const evals = await evaluate(all.map((m) => after(position, mover, m)));
  const leadFor = new Map(all.map((m, i) => [m, sign * (evals[i] as Evaluation).blackLead]));
  const evalFor = new Map(all.map((m, i) => [m, evals[i] as Evaluation]));

  let best = all[0] as number;
  for (const m of all) if ((leadFor.get(m) as number) > (leadFor.get(best) as number)) best = m;
  const bestLead = leadFor.get(best) as number;

  return points.map((m) => {
    const loss = Math.max(0, bestLead - (leadFor.get(m) as number));
    const e = evalFor.get(m) as Evaluation;
    return {
      loss,
      verdict: verdictOf(loss),
      best,
      rank: ranked.indexOf(m) + 1,
      blackLeadAfter: e.blackLead,
      blackWinrateAfter: e.blackWinrate,
    };
  });
}
