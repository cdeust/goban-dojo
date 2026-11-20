import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PASS, POINTS, opposite, pointFromSgf, type Color } from '../src/domain/board.ts';
import { decodeMoves, decodePoints, type Dataset, type Move } from '../src/domain/game.ts';
import { afterCandidate } from '../src/engine/analysis.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { encodeZeroPosition, isLegalZeroMove, searchZero } from '../src/engine/zeroSearch.ts';

const p = pointFromSgf;
const start: EnginePosition = { setupBlack: [], moves: [], next: 'B' };
const fixed =
  (policy = new Float32Array(POINTS + 1), blackValue = 0) =>
  async (position: EnginePosition) => ({
    policy,
    value: position.next === 'B' ? blackValue : -blackValue,
  });

describe('réseau Leela Zero', () => {
  it('encode huit positions, depuis A1, avec les captures, le handicap et le trait', () => {
    const position = {
      setupBlack: [p('ba'), p('ab')],
      moves: [
        { color: 'W' as const, point: p('ss') },
        { color: 'B' as const, point: p('rs') },
        { color: 'W' as const, point: PASS },
        { color: 'B' as const, point: p('sr') },
      ],
      next: 'W' as const,
    };
    const planes = encodeZeroPosition(position);
    const cell = (plane: number, index: number) => planes[plane * POINTS + index];
    expect(planes.length).toBe(18 * POINTS);
    expect([cell(0, 18), cell(1, 18), cell(2, 18), cell(3, 18), cell(4, 18)]).toEqual([
      0, 1, 1, 1, 0,
    ]);
    expect(cell(8, 17)).toBe(1);
    expect(cell(12, 343)).toBe(1); // B19, pierre de handicap.
    expect(cell(13, 343)).toBe(0);
    expect(planes.slice(16 * POINTS, 17 * POINTS).every((v) => v === 0)).toBe(true);
    expect(planes.slice(17 * POINTS).every((v) => v === 1)).toBe(true);
  });

  it('renverse les lignes en sortie et conserve la perspective noire dans tout l’arbre', async () => {
    const scores = new Float32Array(POINTS + 1);
    scores[0] = 30;
    scores[18] = 25;
    const root = { ...start, next: 'W' as const };
    const result = await searchZero(root, fixed(scores, 0.5), { visits: 8 });
    const first = result.choices[0]!;
    expect(first.point).toBe(p('as')); // A1.
    expect(first.blackWin).toBeCloseTo(0.75);
    expect(first.line.slice(0, 2)).toEqual([p('as'), p('ss')]);
    expect(first.visits).toBeLessThanOrEqual(result.visits);
    expect(result.choices.reduce((sum, e) => sum + e.visits, 0)).toBe(8);
    for (const choice of result.choices) {
      let position: EnginePosition = root;
      for (const point of choice.line) {
        expect(isLegalZeroMove(position, point)).toBe(true);
        position = afterCandidate(position, point);
      }
    }
  });

  it.each([
    [1.0000001192092896, 1],
    [-1.0000001192092896, 0],
  ])(
    'borne la valeur tanh float32 %d pour que la probabilité reste dans [0, 1]',
    async (raw, expected) => {
      const { choices } = await searchZero(start, fixed(undefined, raw), { visits: 2 });
      expect(choices.length).toBeGreaterThan(0);
      for (const choice of choices) expect(choice.blackWin).toBe(expected);
    },
  );

  it.each([1 + 2 ** -22, -1 - 2 ** -22, NaN, Infinity, -Infinity])(
    'rejette une valeur hors tolérance ou non finie (%d)',
    async (value) => {
      await expect(searchZero(start, fixed(undefined, value), { visits: 1 })).rejects.toThrow(
        'Sortie du réseau Leela Zero invalide',
      );
    },
  );

  it('rejette une politique dont la dimension est incorrecte même à la borne float32', async () => {
    await expect(
      searchZero(start, fixed(new Float32Array(POINTS), 1.0000001192092896), { visits: 1 }),
    ).rejects.toThrow('Sortie du réseau Leela Zero invalide');
  });

  it('renormalise les autres départs et autorise le coup écarté dès la réponse', async () => {
    const scores = new Float32Array(POINTS + 1).fill(-20);
    scores[0] = 300;
    scores[1] = 20;
    const natural = await searchZero(start, fixed(scores), { visits: 8 });
    expect(natural.choices.map((choice) => choice.point)).toEqual([p('as')]);
    const alternative = await searchZero(start, fixed(scores), { visits: 8, exclude: [p('as')] });
    expect(alternative.visits).toBe(8);
    expect(alternative.choices[0]?.line.slice(0, 2)).toEqual([p('bs'), p('as')]);
    // Même arbre que si cette unique politique de départ avait omis A1.
    const rootScores = scores.slice();
    rootScores[0] = -1000;
    const reference = await searchZero(
      start,
      async (position) => ({
        policy: position.moves.length ? scores : rootScores,
        value: 0,
      }),
      { visits: 8 },
    );
    expect(alternative).toEqual(reference);
  });

  it('renvoie zéro visite lorsque tous les départs légaux sont écartés', async () => {
    const all = Array.from({ length: POINTS + 1 }, (_, i) => i - 1);
    const infer = vi.fn(fixed());
    expect(await searchZero(start, infer, { visits: 8, exclude: all })).toEqual({
      visits: 0,
      choices: [],
    });
    expect(infer).not.toHaveBeenCalled();
  });

  it('classe les branches par visites et change de branche en observant une réfutation', async () => {
    const logits = new Float32Array(POINTS + 1).fill(-18);
    logits[0] = 1;
    logits[1] = 0.9;
    const best = p('bs');
    const result = await searchZero(
      start,
      async (position) => {
        const goodForBlack = position.moves[0]?.point === best;
        return {
          policy: logits,
          value:
            position.moves.length === 0 ? 0 : (position.next === 'B') === goodForBlack ? 1 : -1,
        };
      },
      { visits: 10 },
    );
    expect(result.choices.map((x) => x.point)).toEqual([best, p('as')]);
    expect(result.choices[0]!.blackWin).toBe(1);
    expect(result.choices[1]!.blackWin).toBe(0);
  });

  it('peut restituer soixante demi-coups réellement visités dans un kifu', async () => {
    const dataset: Dataset = JSON.parse(
      readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
    );
    const game = dataset.games.find((game) => game.id === 's001')!;
    const moves = decodeMoves(game.moves);
    const start = {
      setupBlack: decodePoints(game.setupBlack ?? ''),
      next: moves[0]!.color,
      moves: [],
    };
    // Cette politique contrôlée permet de connaître la branche attendue à chaque profondeur.
    const result = await searchZero(
      start,
      async (position) => {
        const next = moves[position.moves.length]!.point;
        const logits = new Float32Array(POINTS + 1).fill(-30);
        const i = next === PASS ? POINTS : (18 - Math.floor(next / 19)) * 19 + (next % 19);
        logits[i] = 30;
        return { policy: logits, value: 0 };
      },
      { visits: 60 },
    );
    expect(result.visits).toBe(60);
    expect(result.choices[0]?.line).toEqual(moves.slice(0, 60).map((m) => m.point));
  });

  it('autorise la passe et utilise le score de surface à 7,5 après deux passes', async () => {
    const logits = new Float32Array(POINTS + 1);
    logits[POINTS] = 30;
    const white = afterCandidate({ ...start, komi: -99 }, PASS);
    const infer = vi.fn(fixed(logits, 1));
    const result = await searchZero(white, infer, { visits: 4 });
    expect(result.choices).toEqual([{ point: PASS, visits: 4, blackWin: 0, line: [PASS] }]);
    expect(infer).toHaveBeenCalledTimes(1);
    const finished = afterCandidate(white, PASS);
    expect(await searchZero(finished, infer, { visits: 4 })).toEqual({ visits: 0, choices: [] });
    expect(isLegalZeroMove(finished, PASS)).toBe(false);
    expect(infer).toHaveBeenCalledTimes(1);
    const surrounded = { ...white, setupBlack: [p('jj')] };
    expect((await searchZero(surrounded, fixed(logits), { visits: 1 })).choices[0]?.blackWin).toBe(
      1,
    );
  });

  it('exclut le suicide et les répétitions même après la levée du ko simple', () => {
    const moves: Move[] = [];
    const setups = [p('dd'), p('jd'), p('pd')];
    const colors: Color[] = ['B', 'W', 'B'];
    for (const [i, center] of setups.entries()) {
      const color = colors[i]!;
      for (const pt of [center - 1, center - 19, center + 19, center + 1])
        moves.push({ color: opposite(color), point: pt });
      for (const pt of [center + 2, center + 1 - 19, center + 1 + 19])
        moves.push({ color, point: pt });
    }
    let position: EnginePosition = { ...start, moves };
    for (const point of [...setups, setups[0]! + 1, setups[1]! + 1]) {
      expect(isLegalZeroMove(position, point)).toBe(true);
      position = afterCandidate(position, point);
    }
    expect(isLegalZeroMove(position, setups[2]! + 1)).toBe(false);
    expect(isLegalZeroMove({ ...start, setupBlack: [p('ab'), p('ba')], next: 'W' }, p('aa'))).toBe(
      false,
    );
    expect(isLegalZeroMove(position, 362)).toBe(false);
  });

  it('annule une recherche en cours avant de publier des visites', async () => {
    const controller = new AbortController();
    const infer = vi.fn(async () => {
      controller.abort();
      return { policy: new Float32Array(POINTS + 1), value: 0 };
    });
    await expect(
      searchZero(start, infer, { visits: 8, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(infer).toHaveBeenCalledTimes(1);
  });
});
