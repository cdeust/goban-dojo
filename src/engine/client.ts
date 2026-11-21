/**
 * Accès au moteur depuis la page. Le réseau (12 Mo) et son moteur d'exécution (15 Mo, 4 Mo
 * compressés) ne sont chargés que si l'utilisateur demande l'évaluation des coups.
 */
import { create } from 'zustand';
import type { Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';
import type { EngineRequest, EngineResponse } from './protocol.ts';

interface EngineState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Part du modèle téléchargée, de 0 à 1. */
  progress: number;
  error?: string;
}

export const useEngine = create<EngineState>(() => ({ status: 'idle', progress: 0 }));

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (e: Evaluation[]) => void; reject: (e: Error) => void }
>();

function failed(message: string): void {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
  useEngine.setState({ status: 'failed', error: message, progress: 0 });
}

/** Démarre le chargement du moteur (sans effet s'il est déjà chargé ou en cours). */
export function loadEngine(): void {
  const { status } = useEngine.getState();
  if (status !== 'idle' && status !== 'failed') return;
  useEngine.setState({ status: 'loading', progress: 0, error: undefined });
  try {
    const current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker = current;
    current.onmessage = (event: MessageEvent<EngineResponse>) => {
      if (worker !== current) return;
      const m = event.data;
      if (m.type === 'progress') useEngine.setState({ progress: m.loaded / m.total });
      else if (m.type === 'ready') useEngine.setState({ status: 'ready', progress: 1 });
      else if (m.type === 'failed') failed(m.message);
      else {
        const request = pending.get(m.id);
        if (!request) return;
        pending.delete(m.id);
        if (m.type === 'evaluated') request.resolve(m.evaluations);
        else request.reject(new Error(m.message));
      }
    };
    current.onerror = (event) => {
      if (worker === current) failed(event.message || 'Le moteur de score s’est arrêté');
    };
    current.onmessageerror = () => {
      if (worker === current) failed('Réponse du moteur de score illisible');
    };
    current.postMessage({ type: 'load', reload: status === 'failed' } satisfies EngineRequest);
  } catch (error) {
    failed(error instanceof Error ? error.message : String(error));
  }
}

export function evaluate(positions: EnginePosition[]): Promise<Evaluation[]> {
  const current = worker;
  if (!current || useEngine.getState().status !== 'ready')
    return Promise.reject(new Error('moteur non chargé'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    current.postMessage({ type: 'evaluate', id, positions } satisfies EngineRequest);
    pending.set(id, { resolve, reject });
  });
}
