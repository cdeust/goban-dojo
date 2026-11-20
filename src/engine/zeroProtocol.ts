import type { EnginePosition } from './features.ts';
import type { ZeroResult } from './zeroSearch.ts';

export type ZeroRequest =
  | { type: 'load'; url: string; wasmUrl: string }
  | { type: 'search'; id: number; position: EnginePosition; visits: number }
  | { type: 'cancel'; id: number };

export type ZeroResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | { type: 'result'; id: number; result: ZeroResult }
  | { type: 'error'; id: number; message: string };
