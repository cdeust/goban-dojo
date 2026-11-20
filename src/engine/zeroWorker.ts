/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
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
  const request = event.data;
  if (request.type === 'cancel') {
    jobs.get(request.id)?.abort();
    return;
  }
  if (request.type === 'load') {
    queue = openModel(request.url, request.wasmUrl, ZERO_MODEL, (n, total) =>
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
