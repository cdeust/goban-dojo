/**
 * Accès au moteur depuis la page. Le réseau (12 Mo) et son moteur d'exécution (15 Mo, 4 Mo
 * compressés) ne sont chargés que si l'utilisateur demande l'évaluation des coups.
 */
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { create } from 'zustand';
import type { Evaluation } from './decode.ts';
import type { EnginePosition } from './features.ts';
import { MODEL } from './model.ts';
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

const send = (message: EngineRequest): void => worker?.postMessage(message);

/** Démarre le chargement du moteur (sans effet s'il est déjà chargé ou en cours). */
export function loadEngine(): void {
  if (useEngine.getState().status !== 'idle' && useEngine.getState().status !== 'failed') return;
  useEngine.setState({ status: 'loading', progress: 0 });
  worker?.terminate();
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<EngineResponse>) => {
    const m = event.data;
    if (m.type === 'progress') useEngine.setState({ progress: m.loaded / m.total });
    else if (m.type === 'ready') useEngine.setState({ status: 'ready', progress: 1 });
    else if (m.type === 'failed') useEngine.setState({ status: 'failed', error: m.message });
    else if (m.type === 'evaluated') {
      pending.get(m.id)?.resolve(m.evaluations);
      pending.delete(m.id);
    } else {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  worker.onerror = (e) => {
    useEngine.setState({ status: 'failed', error: e.message || 'le moteur s’est arrêté' });
    for (const p of pending.values()) p.reject(new Error('le moteur s’est arrêté'));
    pending.clear();
  };
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  send({
    type: 'load',
    modelUrl: new URL(MODEL.file, base).href,
    wasmUrl: new URL(wasmUrl, window.location.href).href,
  });
}

export function evaluate(positions: EnginePosition[]): Promise<Evaluation[]> {
  if (useEngine.getState().status !== 'ready')
    return Promise.reject(new Error('moteur non chargé'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'evaluate', id, positions });
  });
}
