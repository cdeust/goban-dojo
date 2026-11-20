import { afterEach, describe, expect, it, vi } from 'vitest';
import { type InferenceSession } from 'onnxruntime-web/wasm';
import type { EnginePosition } from '../src/engine/features.ts';
import type { ZeroRequest, ZeroResponse } from '../src/engine/zeroProtocol.ts';

const position: EnginePosition = { moves: [], setupBlack: [], next: 'B' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Reprise de Leela Zero', () => {
  it.each(['chargement', 'crash', 'désérialisation'])(
    'remplace le worker après un échec de %s et ignore ses messages tardifs',
    async (source) => {
      const workers: StubWorker[] = [];
      class StubWorker {
        messages: ZeroRequest[] = [];
        onmessage?: (event: { data: ZeroResponse }) => void;
        onerror?: (event: { message: string }) => void;
        onmessageerror?: () => void;
        terminate = vi.fn();
        constructor() {
          workers.push(this);
        }
        postMessage(message: ZeroRequest) {
          this.messages.push(message);
        }
      }
      vi.stubGlobal('Worker', StubWorker);
      const { analyzeZero, useZeroEngine } = await import('../src/engine/zeroClient.ts');
      const attempt = Promise.allSettled([analyzeZero(position), analyzeZero(position)]);
      const first = workers[0]!;
      expect(first.messages[0]).toEqual({ type: 'load', reload: false });
      if (source === 'crash') first.onerror!({ message: 'Worker arrêté' });
      else if (source === 'désérialisation') first.onmessageerror!();
      else first.onmessage!({ data: { type: 'failed', message: 'WebAssembly indisponible' } });
      expect((await attempt).map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(first.terminate).toHaveBeenCalledOnce();
      expect(useZeroEngine.getState().status).toBe('failed');

      const retry = analyzeZero(position);
      const current = workers[1]!;
      expect(current.messages[0]).toEqual({ type: 'load', reload: true });
      first.onmessage!({ data: { type: 'failed', message: 'Ancienne erreur' } });
      current.onmessage!({ data: { type: 'ready' } });
      const search = current.messages[1];
      if (search?.type !== 'search') throw new Error('Recherche manquante');
      const result = { choices: [], visits: 32 };
      current.onmessage!({ data: { type: 'result', id: search.id, result } });
      await expect(retry).resolves.toEqual(result);
      expect(useZeroEngine.getState().status).toBe('ready');
    },
  );

  it('signale une session WASM détruite au client et garde les refus de protocole locaux', async () => {
    const runtime = await import('../src/engine/workerRuntime.ts');
    const session = { run: vi.fn().mockRejectedValue(new WebAssembly.RuntimeError('trap WASM')) };
    vi.spyOn(runtime, 'openModel').mockResolvedValue(session as unknown as InferenceSession);
    const postMessage = vi.fn();
    const scope = {
      location: { origin: 'http://localhost' },
      postMessage,
      onmessage: undefined as ((event: { origin: string; data: ZeroRequest }) => void) | undefined,
    };
    vi.stubGlobal('self', scope);
    await import('../src/engine/zeroWorker.ts');
    const send = (data: ZeroRequest) => scope.onmessage!({ origin: '', data });
    send({ type: 'load', reload: false });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'ready' }));
    send({ type: 'search', id: 0, visits: 0, position });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', id: 0 }));
    send({ type: 'search', id: 1, visits: 1, position });
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: 'failed', message: 'trap WASM' }),
    );
  });

  it('recharge les deux fichiers lors d’une reprise et libère les octets WASM', async () => {
    const { createHash } = await import('node:crypto');
    const ort = await import('onnxruntime-web/wasm');
    const { openModel } = await import('../src/engine/workerRuntime.ts');
    const model = { bytes: 2, sha256: createHash('sha256').update('go').digest('hex') };
    const wasm = new Uint8Array([0, 97, 115, 109]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('go'))
      .mockResolvedValueOnce(new Response(wasm));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(ort.InferenceSession, 'create').mockImplementation(async () => {
      expect(ort.env.wasm.wasmBinary).toEqual(wasm.buffer);
      throw new Error('Compilation interrompue');
    });
    await expect(openModel('/leela.onnx', model, () => {}, true)).rejects.toThrow(
      'Compilation interrompue',
    );
    expect(fetch).toHaveBeenNthCalledWith(1, '/leela.onnx', {
      credentials: 'omit',
      cache: 'reload',
    });
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringMatching(/\.wasm$/), {
      credentials: 'omit',
      cache: 'reload',
    });
    expect(ort.env.wasm.wasmBinary).toBeUndefined();
  });
});
