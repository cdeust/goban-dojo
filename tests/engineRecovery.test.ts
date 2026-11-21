import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InferenceSession } from 'onnxruntime-web/wasm';
import type { EnginePosition } from '../src/engine/features.ts';
import type { EngineRequest, EngineResponse } from '../src/engine/protocol.ts';

const position: EnginePosition = { moves: [], setupBlack: [], next: 'B' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

class StubWorker {
  messages: EngineRequest[] = [];
  onmessage?: (event: { data: EngineResponse }) => void;
  onerror?: (event: { message: string }) => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage(message: EngineRequest) {
    this.messages.push(message);
  }
}

function stubWorkers() {
  const workers: StubWorker[] = [];
  vi.stubGlobal(
    'Worker',
    class extends StubWorker {
      constructor() {
        super();
        workers.push(this);
      }
    },
  );
  return workers;
}

describe('Reprise du moteur de score', () => {
  it('redemande les ressources après un échec de chargement', async () => {
    const workers = stubWorkers();
    const { loadEngine, useEngine } = await import('../src/engine/client.ts');
    loadEngine();
    const first = workers[0]!;
    expect(first.messages).toEqual([{ type: 'load', reload: false }]);
    first.onmessage!({ data: { type: 'failed', message: 'empreinte du modèle inattendue' } });
    expect(useEngine.getState().status).toBe('failed');
    loadEngine();
    expect(workers[1]!.messages).toEqual([{ type: 'load', reload: true }]);
    expect(useEngine.getState().error).toBeUndefined();
  });

  it.each(['inférence', 'crash', 'désérialisation'])(
    'rejette les évaluations en cours sur panne de %s et isole le worker de reprise',
    async (source) => {
      const workers = stubWorkers();
      const { loadEngine, useEngine, evaluate } = await import('../src/engine/client.ts');
      loadEngine();
      const first = workers[0]!;
      first.onmessage!({ data: { type: 'ready' } });
      const requests = Promise.allSettled([evaluate([position]), evaluate([position])]);
      if (source === 'inférence')
        first.onmessage!({ data: { type: 'failed', message: 'trap WASM' } });
      else if (source === 'crash') first.onerror!({ message: 'Worker arrêté' });
      else first.onmessageerror!();
      expect(first.terminate).toHaveBeenCalledOnce();
      expect((await requests).map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(useEngine.getState().status).toBe('failed');
      loadEngine();
      const current = workers[1]!;
      first.onmessage!({ data: { type: 'ready' } });
      first.onerror!({ message: 'Ancienne erreur' });
      first.onmessage!({ data: { type: 'progress', loaded: 1, total: 1 } });
      expect(useEngine.getState()).toMatchObject({ status: 'loading', progress: 0 });
      current.onmessage!({ data: { type: 'ready' } });
      const retry = evaluate([position]);
      const request = current.messages.at(-1);
      if (request?.type !== 'evaluate') throw new Error('Évaluation manquante');
      first.onmessage!({ data: { type: 'error', id: request.id, message: 'Ancienne requête' } });
      current.onmessage!({ data: { type: 'evaluated', id: request.id, evaluations: [] } });
      await expect(retry).resolves.toEqual([]);
      expect(useEngine.getState().status).toBe('ready');
    },
  );

  it('conserve la session après un refus de position et abandonne sa file après une panne en cours de lot', async () => {
    const runtime = await import('../src/engine/workerRuntime.ts');
    const tensor = (length: number) => ({ data: new Float32Array(length) });
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        OutputPolicy: tensor(361),
        OutputPolicyPass: tensor(1),
        OutputValue: tensor(3),
        OutputScoreValue: tensor(3),
        OutputOwnership: tensor(361),
      })
      .mockRejectedValue(new WebAssembly.RuntimeError('trap WASM'));
    const open = vi
      .spyOn(runtime, 'openModel')
      .mockResolvedValue({ run } as unknown as InferenceSession);
    const postMessage = vi.fn();
    const scope = {
      location: { origin: 'http://localhost' },
      postMessage,
      onmessage: undefined as
        ((event: { origin: string; data: EngineRequest }) => void) | undefined,
    };
    vi.stubGlobal('self', scope);
    await import('../src/engine/worker.ts');
    const send = (data: EngineRequest) => scope.onmessage!({ origin: '', data });
    send({ type: 'load', reload: true });
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'ready' }));
    expect(open).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
      true,
    );
    send({ type: 'evaluate', id: 1, positions: [{ ...position, setupBlack: [361] }] });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      id: 1,
      message: 'Position de go invalide',
    });
    send({ type: 'evaluate', id: 2, positions: [position, position] });
    send({ type: 'evaluate', id: 3, positions: [position] });
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: 'failed', message: 'trap WASM' }),
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'evaluated' }));
  });
});
