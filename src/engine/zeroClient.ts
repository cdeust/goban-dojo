import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { create } from 'zustand';
import type { EnginePosition } from './features.ts';
import { ZERO_MODEL } from './zeroModel.ts';
import type { ZeroRequest, ZeroResponse } from './zeroProtocol.ts';
import type { ZeroResult } from './zeroSearch.ts';

interface ZeroEngineState {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  progress: number;
  error?: string;
}

export const useZeroEngine = create<ZeroEngineState>(() => ({ status: 'idle', progress: 0 }));
export type { ZeroResult };
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (result: ZeroResult) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  }
>();
const send = (message: ZeroRequest) => worker?.postMessage(message);

function failed(message: string) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(new Error(message));
  }
  pending.clear();
  useZeroEngine.setState({ status: 'failed', error: message, progress: 0 });
}

/** Le worker est créé à la première demande. Son réseau reste en mémoire entre deux positions. */
export function loadZeroEngine(): void {
  if (worker) return;
  useZeroEngine.setState({ status: 'loading', progress: 0, error: undefined });
  try {
    const current = new Worker(new URL('./zeroWorker.ts', import.meta.url), { type: 'module' });
    worker = current;
    current.onmessage = (event: MessageEvent<ZeroResponse>) => {
      if (worker !== current) return;
      const msg = event.data;
      if (msg.type === 'ready') useZeroEngine.setState({ status: 'ready', progress: 1 });
      else if (msg.type === 'progress') useZeroEngine.setState({ progress: msg.progress });
      else if (msg.type === 'failed') failed(msg.message);
      else {
        const request = pending.get(msg.id);
        if (!request) return;
        pending.delete(msg.id);
        request.cleanup();
        if (msg.type === 'result') request.resolve(msg.result);
        else request.reject(new Error(msg.message));
      }
    };
    current.onerror = (event) => {
      if (worker === current) failed(event.message || 'Leela Zero s’est arrêté');
    };
    const base = new URL(import.meta.env.BASE_URL, location.href);
    send({
      type: 'load',
      url: new URL(ZERO_MODEL.file, base).href,
      wasmUrl: new URL(wasmUrl, location.href).href,
    });
  } catch (error) {
    failed(error instanceof Error ? error.message : String(error));
  }
}

/** Les visites sont des simulations PUCT au départ de cette position. */
export async function analyzeZero(
  position: EnginePosition,
  { visits = 32, signal }: { visits?: number; signal?: AbortSignal } = {},
): Promise<ZeroResult> {
  signal?.throwIfAborted();
  loadZeroEngine();
  if (!worker) throw new Error(useZeroEngine.getState().error);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      send({ type: 'cancel', id });
      reject(signal?.reason ?? new DOMException('Recherche interrompue', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener('abort', abort),
    });
    send({ type: 'search', id, position, visits });
  });
}
