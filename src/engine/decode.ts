/**
 * Décodage des sorties brutes d'un réseau KataGo.
 * Portage du post-traitement de `NNEvaluator` (KataGo v1.18.2, cpp/neuralnet/nneval.cpp,
 * l. 1195-1450).
 */
import type { Color } from '../domain/board.ts';
import { AREA, PASS_INDEX } from './features.ts';

export interface RawOutputs {
  /** [1, canaux, 19, 19] : seul le canal 0 (politique de base) est utilisé. */
  policy: ArrayLike<number>;
  policyPass: ArrayLike<number>;
  /** Gain, perte, sans résultat (logits), du point de vue du joueur au trait. */
  value: ArrayLike<number>;
  /** [0] score moyen / 20, [2] avance (« lead ») / 20, du point de vue du joueur au trait. */
  scoreValue: ArrayLike<number>;
}

export interface Evaluation {
  /** Probabilité de chaque coup (361 points puis la passe) ; 0 pour un coup illégal. */
  policy: Float64Array;
  /** Probabilité de gain de Noir, entre 0 et 1. */
  blackWinrate: number;
  /** Avance de Noir estimée, en points (négative si Blanc mène). */
  blackLead: number;
}

export function decodeOutputs(
  raw: RawOutputs,
  legal: Uint8Array,
  next: Color,
  /** Facteur d'échelle des sorties, inscrit dans les métadonnées du fichier ONNX. */
  scale: number,
): Evaluation {
  const logits = new Float64Array(AREA + 1);
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= AREA; i++) {
    const v = (i < AREA ? (raw.policy[i] as number) : (raw.policyPass[0] as number)) * scale;
    logits[i] = legal[i] ? v : Number.NEGATIVE_INFINITY;
    if ((logits[i] as number) > max) max = logits[i] as number;
  }
  const policy = new Float64Array(AREA + 1);
  let sum = 0;
  for (let i = 0; i <= AREA; i++) {
    policy[i] = legal[i] ? Math.exp((logits[i] as number) - max) : 0;
    sum += policy[i] as number;
  }
  for (let i = 0; i <= AREA; i++) policy[i] = (policy[i] as number) / sum;

  const v = [0, 1, 2].map((i) => (raw.value[i] as number) * scale);
  const vmax = Math.max(...v);
  const e = v.map((x) => Math.exp(x - vmax));
  const total = (e[0] as number) + (e[1] as number) + (e[2] as number);
  const win = (e[0] as number) / total;
  const loss = (e[1] as number) / total;
  const noResult = (e[2] as number) / total;
  const lead = (raw.scoreValue[2] as number) * scale * 20 * (1 - noResult);
  const sign = next === 'B' ? 1 : -1;
  return {
    policy,
    blackWinrate: 0.5 * (1 + sign * (win - loss)),
    blackLead: sign * lead,
  };
}

/** Les `count` coups les plus probables (hors passe), du plus probable au moins probable. */
export function topMoves(policy: Float64Array, count: number): number[] {
  return Array.from({ length: PASS_INDEX }, (_, i) => i)
    .filter((i) => (policy[i] as number) > 0)
    .sort((a, b) => (policy[b] as number) - (policy[a] as number))
    .slice(0, count);
}
