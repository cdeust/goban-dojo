/// <reference lib="webworker" />
import modelUrl from '/engine/leela-zero.onnx?url';
import * as ort from 'onnxruntime-web/wasm';
import { PASS, POINTS } from '../domain/board.ts';
import { isEnginePosition, isIntersection } from './protocol.ts';
import { openModel } from './workerRuntime.ts';
import { ZERO_MODEL } from './zeroModel.ts';
import type { ZeroRequest, ZeroResponse } from './zeroProtocol.ts';
import { encodeZeroPosition, searchZero } from './zeroSearch.ts';
import type { EnginePosition } from './features.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: ZeroResponse): void => scope.postMessage(message);
const jobs = new Map<number, AbortController>();
let session: ort.InferenceSession | undefined;
let queue: Promise<void> = Promise.resolve();

async function infer(position: EnginePosition) {
  if (!session) throw new Error('Réseau Leela Zero indisponible');
  const board = new ort.Tensor('float32', encodeZeroPosition(position), [1, 18, 19, 19]);
  const outputs = await session.run({ board });
  const policy = outputs.policy?.data;
  const value = outputs.value?.data;
  if (
    !(policy instanceof Float32Array) ||
    policy.length !== 362 ||
    !(value instanceof Float32Array) ||
    value.length !== 1
  )
    throw new Error('Sorties du réseau Leela Zero invalides');
  return { policy, value: value[0]! };
}

scope.onmessage = (event: MessageEvent<ZeroRequest>) => {
  // Un Worker dédié reçoit les messages de son port avec une origine vide.
  if (event.origin !== '' && event.origin !== scope.location.origin) return;
  const request = event.data;
  if (!request || typeof request !== 'object') return;
  if (request.type === 'cancel') {
    jobs.get(request.id)?.abort();
    return;
  }
  if (request.type === 'load') {
    queue = openModel(modelUrl, ZERO_MODEL, (n, total) =>
      post({ type: 'progress', progress: n / total }),
    ).then(
      (s) => {
        session = s;
        post({ type: 'ready' });
      },
      (e: unknown) => post({ type: 'failed', message: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  if (request.type !== 'search' || !Number.isSafeInteger(request.id)) return;
  if (!Number.isSafeInteger(request.visits) || request.visits < 1 || request.visits > 128) {
    post({ type: 'error', id: request.id, message: 'Budget de recherche hors limites' });
    return;
  }
  if (!isEnginePosition(request.position)) {
    post({ type: 'error', id: request.id, message: 'Position de go invalide' });
    return;
  }
  const exclude = request.exclude;
  if (
    exclude !== undefined &&
    (!Array.isArray(exclude) ||
      exclude.length > POINTS + 1 ||
      !exclude.every((p) => p === PASS || isIntersection(p)))
  ) {
    post({ type: 'error', id: request.id, message: 'Coups exclus invalides' });
    return;
  }
  const controller = new AbortController();
  jobs.set(request.id, controller);
  queue = queue.then(async () => {
    try {
      let lastYield = performance.now();
      const evaluate = async (position: EnginePosition) => {
        if (performance.now() - lastYield >= 50) {
          // WASM peut résoudre toutes ses promesses dans la même tâche, sans recevoir « cancel ».
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = performance.now();
        }
        controller.signal.throwIfAborted();
        return infer(position);
      };
      controller.signal.throwIfAborted();
      const result = await searchZero(request.position, evaluate, {
        visits: request.visits,
        exclude,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) post({ type: 'result', id: request.id, result });
    } catch (error) {
      if (!controller.signal.aborted)
        post({
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        });
    } finally {
      jobs.delete(request.id);
    }
  });
};
