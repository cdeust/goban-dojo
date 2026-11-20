/// <reference lib="webworker" />
/**
 * Fil d'exécution du moteur : charge le réseau, en vérifie l'empreinte, puis évalue des
 * positions à la demande, sans jamais bloquer l'affichage.
 */
import * as ort from 'onnxruntime-web/wasm';
import { decodeOutputs } from './decode.ts';
import { AREA, GLOBAL_FEATURES, SPATIAL_PLANES, encodePosition } from './features.ts';
import { openModel } from './workerRuntime.ts';
import { MODEL } from './model.ts';
import type { EngineRequest, EngineResponse } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: EngineResponse): void => scope.postMessage(message);

let session: ort.InferenceSession | null = null;
let evaluationQueue = Promise.resolve();

scope.onmessage = (event: MessageEvent<EngineRequest>): void => {
  const request = event.data;
  if (request.type === 'load') {
    openModel(request.modelUrl, request.wasmUrl, MODEL, (loaded, total) =>
      post({ type: 'progress', loaded, total }),
    ).then(
      (s) => {
        session = s;
        post({ type: 'ready' });
      },
      (e: unknown) => post({ type: 'failed', message: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  const { id, positions } = request;
  evaluationQueue = evaluationQueue.then(async () => {
    try {
      if (!session) throw new Error('moteur non chargé');
      const evaluations = [];
      for (const position of positions) {
        const enc = encodePosition(position);
        const out = await session.run({
          InputSpatial: new ort.Tensor('float32', enc.spatial, [1, SPATIAL_PLANES, 19, 19]),
          InputGlobal: new ort.Tensor('float32', enc.global, [1, GLOBAL_FEATURES, 1, 1]),
          InputMask: new ort.Tensor('float32', enc.spatial.slice(0, AREA), [1, 1, 19, 19]),
        });
        const data = (name: string): Float32Array => {
          const tensor = out[name];
          if (!tensor) throw new Error(`sortie ${name} absente`);
          return tensor.data as Float32Array;
        };
        evaluations.push(
          decodeOutputs(
            {
              policy: data('OutputPolicy'),
              policyPass: data('OutputPolicyPass'),
              value: data('OutputValue'),
              scoreValue: data('OutputScoreValue'),
              ownership: data('OutputOwnership'),
            },
            enc.legal,
            position.next,
            MODEL.outputScale,
          ),
        );
      }
      post({ type: 'evaluated', id, evaluations });
    } catch (e) {
      post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
    }
  });
};
