import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import * as ort from 'onnxruntime-web/wasm';

interface ModelAsset {
  bytes: number;
  sha256: string;
}

/** Vérifie la taille et l'empreinte des poids avant de les transmettre à WASM. */
export async function openModel(
  url: string,
  model: ModelAsset,
  onProgress: (loaded: number, total: number) => void,
  reload = false,
): Promise<ort.InferenceSession> {
  const res = await fetch(url, { credentials: 'omit', cache: reload ? 'reload' : 'default' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(model.bytes);
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > model.bytes) {
      await reader.cancel();
      throw new Error('taille du modèle inattendue');
    }
    bytes.set(value, loaded);
    loaded += value.length;
    onProgress(loaded, model.bytes);
  }
  if (loaded !== model.bytes) throw new Error('taille du modèle inattendue');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== model.sha256) throw new Error('empreinte du modèle inattendue');

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  if (reload) {
    // ORT ne transmet pas d’option de cache au navigateur pour son propre téléchargement.
    const wasm = await fetch(wasmUrl, { credentials: 'omit', cache: 'reload' });
    if (!wasm.ok) throw new Error(`WebAssembly · HTTP ${wasm.status}`);
    ort.env.wasm.wasmBinary = await wasm.arrayBuffer();
  }
  try {
    return await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  } finally {
    if (reload) delete ort.env.wasm.wasmBinary;
  }
}
