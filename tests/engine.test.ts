import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { opposite, PASS, type Color } from '../src/domain/board.ts';
import { buildTimeline } from '../src/domain/game.ts';
import { afterCandidate, candidatesOf } from '../src/engine/analysis.ts';
import { decodeOutputs, topMoves, type Evaluation } from '../src/engine/decode.ts';
import {
  AREA,
  encodePosition,
  trappedStones,
  type EnginePosition,
} from '../src/engine/features.ts';
import { judgeMoves, scoreChange, verdictOf } from '../src/engine/judge.ts';
import { previewLines, type PreviewLine } from '../src/engine/preview.ts';

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
  it('refuse les intersections invalides avant de les employer dans les plans ou le shicho', () => {
    // Le worker reçoit des données JavaScript, même si le protocole TypeScript déclare un nombre.
    const textPoint = '0' as unknown as number;
    for (const point of [PASS, AREA, 0.5, NaN, textPoint]) {
      const position: EnginePosition = { setupBlack: [point], moves: [], next: 'B' };
      expect(() => encodePosition(position)).toThrow(RangeError);
      expect(() => trappedStones(position)).toThrow(RangeError);
    }
    for (const point of [PASS - 1, AREA, 0.5, NaN, textPoint]) {
      const position: EnginePosition = {
        setupBlack: [],
        moves: [{ color: 'B', point }],
        next: 'W',
      };
      expect(() => encodePosition(position)).toThrow(RangeError);
      expect(() => trappedStones(position)).toThrow(RangeError);
    }
  });

  it('accepte les deux intersections extrêmes et distingue la passe du handicap', () => {
    const position: EnginePosition = {
      setupBlack: [AREA - 1],
      moves: [
        { color: 'W', point: 0 },
        { color: 'B', point: PASS },
      ],
      next: 'W',
    };
    const { spatial, global, legal } = encodePosition(position);
    expect(spatial[AREA]).toBe(1); // Blanc au premier point
    expect(spatial[2 * AREA + AREA - 1]).toBe(1); // Noir au dernier point
    expect(global[0]).toBe(1); // dernier coup passé
    expect(legal[AREA]).toBe(1);
    expect(trappedStones(position)).toEqual([]);
  });

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

  it.each(['B', 'W'] as const)(
    'mesure le coup et l’échange depuis la position initiale de %s',
    async (player) => {
      const base: EnginePosition = { setupBlack: [], moves: [], next: player, komi: 6.5 };
      const leads = [1.5, 4.5, -0.5];
      const fake = async (positions: EnginePosition[]): Promise<Evaluation[]> =>
        positions.map((position) => {
          expect(position.komi).toBe(6.5);
          return {
            policy: new Float64Array(AREA + 1),
            blackWinrate: 0.5,
            blackLead: leads[position.moves.length]!,
          };
        });
      const human = (await judgeMoves(fake, base, [0]))[0]!;
      const response = (await judgeMoves(fake, afterCandidate(base, 0), [PASS]))[0]!;
      expect(human).toMatchObject({ blackLeadBefore: 1.5, blackLeadAfter: 4.5 });
      expect(response).toMatchObject({ blackLeadBefore: 4.5, blackLeadAfter: -0.5 });
      expect(scoreChange(player, human)).toBe(player === 'B' ? 3 : -3);
      expect(scoreChange(player, human, response)).toBe(player === 'B' ? -2 : 2);
    },
  );

  it('compare la passe dans les cinq candidats et conserve les ex æquo', async () => {
    const base: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
    const policy = new Float64Array(AREA + 1);
    for (let point = 0; point < 6; point++) policy[point] = 0.1;
    policy[AREA] = 0.4;
    const batches: number[][] = [];
    const evaluate = async (positions: EnginePosition[]): Promise<Evaluation[]> => {
      batches.push(positions.flatMap((p) => p.moves.map((m) => m.point)));
      return positions.map((p) => ({
        policy,
        blackWinrate: 0.5,
        blackLead: p.moves.at(-1)?.point === PASS ? 2 : 0,
      }));
    };
    const [stone, pass] = await judgeMoves(evaluate, base, [0, PASS]);
    expect(batches[1]).toEqual([PASS, 0, 1, 2, 3]);
    expect(stone).toMatchObject({ rank: 2, loss: 2, best: PASS });
    expect(pass).toMatchObject({ rank: 1, loss: 0, best: PASS });
    policy[AREA] = 0.1;
    const [tiedPass] = await judgeMoves(evaluate, base, [PASS]);
    expect(tiedPass?.rank).toBe(7);
  });

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

describe('pierres prises au piège', () => {
  const at = (s: string): number => (s.charCodeAt(1) - 97) * 19 + (s.charCodeAt(0) - 97);
  const seq = (coords: string): EnginePosition['moves'] =>
    coords.split(' ').map((c, i) => ({ color: i % 2 === 0 ? 'B' : 'W', point: at(c) }) as const);

  it('un shicho sans pierre de secours fonctionne : la pierre en atari est perdue', () => {
    // Blanc d4 ; Noir c4, d3, c5 puis e4 : il ne reste à Blanc que d5, et la fuite en diagonale
    // vers le coin opposé ne rencontre aucune pierre amie (les autres coups blancs sont en a19, a18).
    const moves = seq('cp dp dq aa co ab ep');
    expect(trappedStones({ setupBlack: [], moves, next: 'W' })).toEqual([at('dp')]);
  });

  it('avec une pierre amie sur le chemin, le shicho casse : la pierre n’est pas piégée', () => {
    // Même forme, mais Blanc a une pierre en g7, sur la diagonale de fuite.
    const moves = seq('cp dp dq gm co ab ep');
    expect(trappedStones({ setupBlack: [], moves, next: 'W' })).toEqual([]);
  });

  it('ne signale rien sur un goban vide', () => {
    const empty: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
    expect(trappedStones(empty)).toEqual([]);
  });
});

it('garde le rang réel du coup historique et inclut la passe quand elle est classée', () => {
  const position: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
  const policy = new Float64Array(362);
  for (let point = 0; point < 20; point++) policy[point] = (20 - point) / 300;
  policy[361] = 0.2;
  const choices = candidatesOf(position, policy, 19);
  expect(choices).toHaveLength(12);
  expect(choices[0]).toMatchObject({ point: -1, rank: 1, recorded: false });
  expect(choices.at(-1)).toMatchObject({ point: 19, rank: 21, recorded: true });
  expect(candidatesOf(afterCandidate(afterCandidate(position, -1), -1), policy)).toEqual([]);
});

it('oriente la carte de propriété du réseau selon la couleur au trait', () => {
  const raw = {
    policy: new Float32Array(AREA),
    policyPass: [0],
    value: [0, 0, 0],
    scoreValue: [0, 0, 0],
    ownership: [1, 0, -1],
  };
  const legal = new Uint8Array(AREA + 1).fill(1);
  const black = decodeOutputs(raw, legal, 'B', 2).blackOwnership!;
  const white = decodeOutputs(raw, legal, 'W', 2).blackOwnership!;
  expect(black[0]).toBeCloseTo(Math.tanh(2));
  expect(white[0]).toBeCloseTo(-Math.tanh(2));
  expect(black[2]).toBeCloseTo(-Math.tanh(2));
});

it('simule plusieurs premiers coups distincts et rejoue chaque branche selon les règles', async () => {
  const ref = reference.positions.find(
    (position) => position.moves.length > 80 && position.next === 'W',
  )!;
  const position = {
    setupBlack: ref.setupBlack,
    moves: ref.moves.map(([color, point]) => ({ color, point })),
    next: ref.next,
  };
  const recorded = { color: ref.next, point: ref.top[0]![0] };
  const received: PreviewLine[] = [];
  const lines = await previewLines(
    evaluate,
    position,
    recorded,
    new AbortController().signal,
    (line, index) => {
      if (received[index]) expect(received[index]!.moves).toEqual(line.moves.slice(0, 2));
      received[index] = line;
    },
  );
  expect(lines).toEqual(received);
  expect(lines).toHaveLength(3);
  const roots = lines.map((line) => line.moves[0]!.point);
  expect(new Set(roots).size).toBe(lines.length);
  expect(roots).not.toContain(recorded.point);
  for (const { moves, estimates } of lines) {
    expect(moves).toHaveLength(8);
    expect(estimates.every(Number.isFinite)).toBe(true);
    expect(moves[0]!.color).toBe(position.next);
    expect(moves[1]!.color).toBe(opposite(position.next));
    expect(buildTimeline(position.setupBlack, [...position.moves, ...moves]).illegal).toEqual([]);
  }
}, 30_000);

it('transmet le komi du kifu aux branches évaluées par le moteur', () => {
  const position: EnginePosition = { setupBlack: [], moves: [], next: 'B', komi: 6.5 };
  expect(encodePosition(position).global[5]).toBeCloseTo(-6.5 / 20);
  expect(afterCandidate(position, 0).komi).toBe(6.5);
});
