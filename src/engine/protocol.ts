import type { Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';

/** Messages échangés entre la page et le fil d'exécution du moteur. */
export type EngineRequest =
  | { type: 'load'; modelUrl: string; wasmUrl: string }
  | { type: 'evaluate'; id: number; positions: EnginePosition[] };

export type EngineResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'evaluated'; id: number; evaluations: Evaluation[] }
  | { type: 'error'; id: number; message: string };
