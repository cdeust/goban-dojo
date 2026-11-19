/// <reference lib="webworker" />
/**
 * Fil d'exécution du moteur : charge le réseau, en vérifie l'empreinte, puis évalue des
 * positions à la demande, sans jamais bloquer l'affichage.
 */
import * as ort from 'onnxruntime-web/wasm';
import { decodeOutputs } from './decode.ts';
import { AREA, GLOBAL_FEATURES, SPATIAL_PLANES, encodePosition } from './features.ts';
import { MODEL } from './model.ts';
import type { EngineRequest, EngineResponse } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: EngineResponse): void => scope.postMessage(message);

let session: ort.InferenceSession | null = null;
let evaluationQueue = Promise.resolve();

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const bytes = new Uint8Array(MODEL.bytes);
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Un fichier plus gros qu'annoncé n'est pas le bon : on s'arrête sans tout charger.
    if (loaded + value.length > MODEL.bytes) throw new Error('taille du modèle inattendue');
    bytes.set(value, loaded);
    loaded += value.length;
    post({ type: 'progress', loaded, total: MODEL.bytes });
  }
  if (loaded !== MODEL.bytes) throw new Error('taille du modèle inattendue');
  return bytes;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function load(modelUrl: string, wasmUrl: string): Promise<void> {
  const bytes = await download(modelUrl);
  if ((await sha256(bytes as Uint8Array<ArrayBuffer>)) !== MODEL.sha256) {
    throw new Error('empreinte du modèle inattendue');
  }
  // Un seul fil : les fils WASM exigeraient des en-têtes COOP/COEP que l'hébergeur ne garantit pas.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

scope.onmessage = (event: MessageEvent<EngineRequest>): void => {
  const request = event.data;
  if (request.type === 'load') {
    load(request.modelUrl, request.wasmUrl).then(
      () => post({ type: 'ready' }),
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
