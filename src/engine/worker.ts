/// <reference lib="webworker" />
/**
 * Fil d'exécution du moteur : charge le réseau, en vérifie l'empreinte, puis évalue des
 * positions à la demande, sans jamais bloquer l'affichage.
 */
import modelUrl from '/engine/kata1-b10c128-s1141046784-d204142634.onnx?url';
import * as ort from 'onnxruntime-web/wasm';
import { decodeOutputs } from './decode.ts';
import { AREA, GLOBAL_FEATURES, SPATIAL_PLANES, encodePosition } from './features.ts';
import { openModel } from './workerRuntime.ts';
import { MODEL } from './model.ts';
import { isEnginePosition, type EngineRequest, type EngineResponse } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: EngineResponse): void => scope.postMessage(message);

let session: ort.InferenceSession | null = null;
let evaluationQueue = Promise.resolve();

scope.onmessage = (event: MessageEvent<EngineRequest>): void => {
  // Un Worker dédié reçoit les messages de son port avec une origine vide.
  if (event.origin !== '' && event.origin !== scope.location.origin) return;
  const request = event.data;
  if (!request || typeof request !== 'object') return;
  if (request.type === 'load') {
    openModel(modelUrl, MODEL, (loaded, total) => post({ type: 'progress', loaded, total })).then(
      (s) => {
        session = s;
        post({ type: 'ready' });
      },
      (e: unknown) => post({ type: 'failed', message: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  if (request.type !== 'evaluate') return;
  const { id, positions } = request;
  if (!Array.isArray(positions) || !positions.every(isEnginePosition)) {
    post({ type: 'error', id, message: 'Position de go invalide' });
    return;
  }
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
