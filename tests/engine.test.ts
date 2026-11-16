import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Color } from '../src/domain/board.ts';
import { decodeOutputs, topMoves, type Evaluation } from '../src/engine/decode.ts';
import { AREA, encodePosition, type EnginePosition } from '../src/engine/features.ts';
import { judgeMoves, verdictOf } from '../src/engine/judge.ts';

/**
 * Reproduction de la référence : le portage TypeScript (encodeur + décodeur), exécuté sur le
 * réseau b6c96 converti en ONNX, doit redonner les sorties de KataGo natif (v1.18.2, backend
 * Eigen) sur 53 positions tirées des parties de Shūsaku, dont 15 à handicap.
 */
interface Reference {
  positions: {
    id: string;
    setupBlack: number[];
    moves: [Color, number][];
    next: Color;
    blackWinrate: number;
    blackLead: number;
    illegal: number;
    top: [number, number][];
  }[];
}

const fixtures = join(import.meta.dirname, 'fixtures');
const reference = JSON.parse(
  readFileSync(join(fixtures, 'katago-b6c96-reference.json'), 'utf8'),
) as Reference;
/** Facteur d'échelle des sorties des réseaux convolutifs exportés par `katago dumponnx`. */
const SCALE = 8;

let session: ort.InferenceSession;

async function evaluate(positions: EnginePosition[]): Promise<Evaluation[]> {
  const out: Evaluation[] = [];
  for (const p of positions) {
    const enc = encodePosition(p);
    const r = await session.run({
      InputSpatial: new ort.Tensor('float32', enc.spatial, [1, 22, 19, 19]),
      InputGlobal: new ort.Tensor('float32', enc.global, [1, 19, 1, 1]),
      InputMask: new ort.Tensor('float32', enc.spatial.slice(0, AREA), [1, 1, 19, 19]),
    });
    out.push(
      decodeOutputs(
        {
          policy: r.OutputPolicy!.data as Float32Array,
          policyPass: r.OutputPolicyPass!.data as Float32Array,
          value: r.OutputValue!.data as Float32Array,
          scoreValue: r.OutputScoreValue!.data as Float32Array,
        },
        enc.legal,
        p.next,
        SCALE,
      ),
    );
  }
  return out;
}

beforeAll(async () => {
  ort.env.wasm.numThreads = 1;
  const model = readFileSync(join(fixtures, 'kata1-b6c96-s175395328-d26788732.onnx'));
  session = await ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: ['wasm'],
  });
}, 60_000);

describe('portage de l’encodeur KataGo', () => {
  it('redonne les sorties du moteur natif sur 53 positions du corpus', async () => {
    expect(reference.positions).toHaveLength(53);
    let worstPolicy = 0;
    let worstWinrate = 0;
    let worstLead = 0;
    for (const ref of reference.positions) {
      const position: EnginePosition = {
        setupBlack: ref.setupBlack,
        moves: ref.moves.map(([color, point]) => ({ color, point })),
        next: ref.next,
      };
      const [e] = await evaluate([position]);
      if (!e) throw new Error('évaluation absente');
      // Mêmes coups illégaux (points occupés, ko, suicide).
      let illegal = 0;
      for (let i = 0; i < AREA; i++) if (e.policy[i] === 0) illegal++;
      expect(illegal, ref.id).toBe(ref.illegal);
      // Même premier choix, mêmes probabilités sur les cinq premiers coups.
      expect(topMoves(e.policy, 1)[0], ref.id).toBe(ref.top[0]?.[0]);
      for (const [index, prob] of ref.top) {
        worstPolicy = Math.max(worstPolicy, Math.abs((e.policy[index] as number) - prob));
      }
      worstWinrate = Math.max(worstWinrate, Math.abs(e.blackWinrate - ref.blackWinrate));
      worstLead = Math.max(worstLead, Math.abs(e.blackLead - ref.blackLead));
    }
    expect(worstPolicy).toBeLessThan(1e-4);
    expect(worstWinrate).toBeLessThan(1e-4);
    expect(worstLead).toBeLessThan(1e-3);
  }, 120_000);

  it('sur goban vide sans komi : coins préférés, Noir en avance de quelques points', async () => {
    const [e] = await evaluate([{ setupBlack: [], moves: [], next: 'B' }]);
    if (!e) throw new Error('évaluation absente');
    for (const p of topMoves(e.policy, 4)) {
      const x = Math.min(p % 19, 18 - (p % 19));
      const y = Math.min(Math.floor(p / 19), 18 - Math.floor(p / 19));
      expect([2, 3]).toContain(x);
      expect([2, 3]).toContain(y);
    }
    expect(e.blackLead).toBeGreaterThan(2);
    expect(e.blackLead).toBeLessThan(9);
    expect(e.blackWinrate).toBeGreaterThan(0.5);
  }, 60_000);
});

describe('jugement d’un coup', () => {
  it('classe les pertes en trois catégories', () => {
    expect(verdictOf(0)).toBe('bon');
    expect(verdictOf(1.99)).toBe('bon');
    expect(verdictOf(2)).toBe('discutable');
    expect(verdictOf(4.99)).toBe('discutable');
    expect(verdictOf(5)).toBe('erreur');
  });

  it('un premier coup au bord perd nettement plus qu’un coup au coin', async () => {
    const empty: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
    const corner = 3 * 19 + 15; // Q16
    const edge = 0; // A19
    const [good, bad] = await judgeMoves(evaluate, empty, [corner, edge]);
    expect(good?.verdict).toBe('bon');
    expect(good?.rank).toBeGreaterThan(0);
    // Les huit points 3-4 et les quatre points 4-4 se partagent les douze premiers rangs.
    expect(good?.rank).toBeLessThanOrEqual(12);
    expect(bad?.verdict).toBe('erreur');
    expect(bad?.loss).toBeGreaterThan((good?.loss ?? 0) + 5);
    // Le meilleur coup selon le réseau est le même dans les deux jugements.
    expect(bad?.best).toBe(good?.best);
  }, 60_000);

  it('avec un évaluateur simulé : la perte est l’écart au meilleur candidat, du point de vue du joueur', async () => {
    // Blanc au trait. L'avance de Noir après chaque coup est donnée par cette table.
    const leadAfter = new Map([
      [10, -6],
      [20, -4],
      [30, 1],
    ]);
    const fake = async (positions: EnginePosition[]): Promise<Evaluation[]> =>
      positions.map((p) => {
        const policy = new Float64Array(362);
        policy[10] = 0.6;
        policy[20] = 0.4;
        const last = p.moves.at(-1)?.point ?? -1;
        return { policy, blackWinrate: 0.5, blackLead: leadAfter.get(last) ?? 0 };
      });
    const base: EnginePosition = { setupBlack: [], moves: [{ color: 'B', point: 0 }], next: 'W' };
    const [a, b, c] = await judgeMoves(fake, base, [10, 20, 30]);
    // Pour Blanc, le meilleur est le coup 10 (Noir à −6).
    expect(a).toMatchObject({ loss: 0, verdict: 'bon', best: 10, rank: 1 });
    expect(b).toMatchObject({ loss: 2, verdict: 'discutable', best: 10, rank: 2 });
    expect(c).toMatchObject({ loss: 7, verdict: 'erreur', best: 10, rank: 0 });
  });
});
