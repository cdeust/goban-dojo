import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEnginePosition } from '../src/engine/protocol.ts';
import { openModel } from '../src/engine/workerRuntime.ts';

// Ces rejets doivent survenir avant toute tentative de charger WASM ou de créer une session.
describe('Intégrité du modèle téléchargé', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { payload: 'x', bytes: 2, message: 'taille' },
    { payload: 'xxx', bytes: 2, message: 'taille' },
    { payload: 'xx', bytes: 2, message: 'empreinte' },
  ])('rejette $payload lorsque $message est incorrecte', async ({ payload, bytes, message }) => {
    const fetch = vi.fn(async () => new Response(payload));
    vi.stubGlobal('fetch', fetch);
    await expect(openModel('/model', { bytes, sha256: '0'.repeat(64) }, () => {})).rejects.toThrow(
      message,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});

it('valide les coordonnées et les couleurs échangées avec un worker', () => {
  const valid = { next: 'B', setupBlack: [23], moves: [{ color: 'W', point: -1 }] };
  expect(isEnginePosition(valid)).toBe(true);
  for (const point of ['12', -2, 361, 1.5]) {
    expect(isEnginePosition({ ...valid, moves: [{ color: 'B', point }] })).toBe(false);
    expect(isEnginePosition({ ...valid, setupBlack: [point] })).toBe(false);
  }
  expect(isEnginePosition({ ...valid, next: 'X' })).toBe(false);
});
