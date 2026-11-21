import { describe, expect, it, vi } from 'vitest';
import { PASS, POINTS, opposite, pointFromSgf as p, type Color } from '../src/domain/board.ts';
import { importSgf } from '../src/domain/importSgf.ts';
import { afterCandidate } from '../src/engine/analysis.ts';
import type { Evaluation } from '../src/engine/decode.ts';
import type { EnginePosition } from '../src/engine/features.ts';
import { isLegalZeroMove } from '../src/engine/zeroSearch.ts';
import { StudyLines, studyStart } from '../src/state/studyLines.ts';

const signal = () => new AbortController().signal;
const update = () => {};
const root: EnginePosition = { moves: [], setupBlack: [100], komi: -1.5, next: 'W' };

function result(lead: number, ...preferences: number[]): Evaluation {
  const policy = new Float64Array(POINTS + 1);
  preferences.forEach((point, i) => {
    policy[point === PASS ? POINTS : point] = 1 / (i + 1);
  });
  return { policy, blackLead: lead, blackWinrate: 0.5 };
}

function evaluation(position: EnginePosition, start = root) {
  const moves = position.moves.slice(start.moves.length);
  const first = moves[0]?.point ?? 0;
  if (!moves.length) return result(0, 100, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
  // La préférence apparente juste après le premier coup s'inverse après la réplique.
  if (moves.length === 1) return result(first, first, 40 + first);
  return result(-first - (position.komi ?? 0), 180 + moves.length);
}

describe('Classement des suites d’étude', () => {
  it.each(['B', 'W'] as const)(
    'compare 10 branches APRÈS la réponse, du point de vue de %s',
    async (color: Color) => {
      const start: EnginePosition = {
        ...root,
        next: color,
        moves: [{ color: opposite(color), point: 120 }],
      };
      const evaluator = vi.fn(async (positions: EnginePosition[]) =>
        positions.map((pos) => evaluation(pos, start)),
      );
      const study = new StudyLines(start, 30, evaluator);
      const firstPublished: number[] = [];
      await study.rank(signal(), () => {
        if (study.rows().length === 1) firstPublished.push(study.rows()[0]!.point);
      });
      const rows = study.rows();
      expect(firstPublished).toEqual([30]);
      expect(rows).toHaveLength(10);
      expect(new Set(rows.map((r) => r.point))).toEqual(new Set([30, 0, 1, 2, 3, 4, 5, 6, 7, 8]));
      const sign = color === 'B' ? 1 : -1;
      expect(rows.map((r) => r.lead)).toEqual(rows.map((r) => r.lead).sort((a, b) => b - a));
      expect(rows[0]!.point).toBe(color === 'B' ? 0 : 30);
      for (const row of rows) {
        expect(row).toMatchObject({
          recorded: row.point === 30,
          reply: 40 + row.point,
          horizon: 2,
          lead: sign * (-row.point + 1.5),
          delta: row.point === 30 ? 0 : sign * (30 - row.point),
        });
      }
      expect(evaluator).toHaveBeenCalledTimes(21);
      for (const [positions] of evaluator.mock.calls) {
        expect(positions).toHaveLength(1);
        expect(positions[0]!).toMatchObject({ komi: -1.5, setupBlack: [100] });
        expect(positions[0]!.moves[0]).toEqual(start.moves[0]);
      }
    },
  );

  it('prolonge uniquement le préfixe choisi jusqu’à 20 demi-coups légaux et réutilise les lectures', async () => {
    const evaluator = vi.fn(async (positions: EnginePosition[]) =>
      positions.map((pos) => evaluation(pos)),
    );
    const study = new StudyLines(root, 30, evaluator);
    await study.rank(signal(), update);
    const count = evaluator.mock.calls.length;
    const partial: number[] = [];
    await study.read(3, signal(), () => partial.push(study.line(3).length));
    const line = study.line(3);
    expect(line).toHaveLength(20);
    expect(partial[0]).toBe(3);
    expect(line.slice(0, 2)).toEqual([
      { color: 'W', point: 3 },
      { color: 'B', point: 43 },
    ]);
    let current = root;
    for (const move of line) {
      expect(current.next).toBe(move.color);
      expect(isLegalZeroMove(current, move.point)).toBe(true);
      current = afterCandidate(current, move.point);
    }
    expect(evaluator.mock.calls.slice(count).every(([[pos]]) => pos!.moves[0]!.point === 3)).toBe(
      true,
    );
    expect(evaluator.mock.calls.length - count).toBe(17);
    expect(study.line(4)).toHaveLength(2);
    await study.read(3, signal(), update);
    await study.rank(signal(), update);
    expect(evaluator.mock.calls.length - count).toBe(17);
  });

  it('inclut une passe du kifu, raccourcit une branche terminée et ne cherche jamais après deux passes', async () => {
    const start: EnginePosition = { ...root, moves: [{ color: 'B', point: PASS }] };
    const evaluator = vi.fn(async (positions: EnginePosition[]) =>
      positions.map(() => result(2, 0, PASS)),
    );
    const study = new StudyLines(start, PASS, evaluator);
    await study.rank(signal(), update);
    expect(study.rows().find((r) => r.recorded)).toMatchObject({
      point: PASS,
      reply: null,
      horizon: 1,
      lead: -2,
      delta: 0,
    });
    const before = evaluator.mock.calls.length;
    await study.read(PASS, signal(), update);
    expect(study.complete(PASS)).toBe(true);
    const ended = new StudyLines(afterCandidate(start, PASS), undefined, evaluator);
    await ended.rank(signal(), update);
    await ended.read(2, signal(), update);
    expect(ended.finished).toBe(true);
    expect(ended.rows()).toEqual([]);
    expect(evaluator.mock.calls.length).toBe(before);
  });

  it('ne crée pas de référence à la fin du kifu ou si son prochain coup est illégal', async () => {
    const evaluator = async (positions: EnginePosition[]) =>
      positions.map((pos) => evaluation(pos));
    for (const recorded of [undefined, 100]) {
      const study = new StudyLines(root, recorded, evaluator);
      await study.rank(signal(), update);
      expect(study.rows()).toHaveLength(10);
      expect(
        study.rows().every((row) => !row.recorded && row.delta === null && row.point !== 100),
      ).toBe(true);
    }
  });

  it('interrompt la file obsolète et déduplique une recherche partagée au même emplacement', async () => {
    let finish!: (items: Evaluation[]) => void;
    const gate = new Promise<Evaluation[]>((resolve) => {
      finish = resolve;
    });
    const evaluator = vi
      .fn(async (positions: EnginePosition[]) => positions.map((pos) => evaluation(pos)))
      .mockImplementationOnce(() => gate);
    const study = new StudyLines(root, 30, evaluator);
    const old = new AbortController();
    const abandoned = study.rank(old.signal, update);
    old.abort();
    const retried = study.rank(signal(), update);
    finish([evaluation(root)]);
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
    await retried;
    expect(evaluator).toHaveBeenCalledTimes(21);
    expect(study.rows()).toHaveLength(10);
  });

  it('permet une relance partielle sans recalculer le premier couple déjà classé', async () => {
    let fail = true;
    const evaluator = vi.fn(async (positions: EnginePosition[]) =>
      positions.map((pos) => {
        if (fail && pos.moves[0]?.point === 0) throw new Error('WASM indisponible');
        return evaluation(pos);
      }),
    );
    const study = new StudyLines(root, 30, evaluator);
    await expect(study.rank(signal(), update)).rejects.toThrow('WASM indisponible');
    expect(study.rows().map((row) => row.point)).toEqual([30]);
    fail = false;
    study.clearErrors();
    await study.rank(signal(), update);
    expect(study.rows()).toHaveLength(10);
    expect(evaluator.mock.calls.filter(([[pos]]) => pos?.moves[0]?.point === 30)).toHaveLength(2);
    expect(evaluator.mock.calls.filter(([[pos]]) => !pos?.moves.length)).toHaveLength(1);
  });

  it('rejoue le préfixe arbitraire d’un SGF avec son handicap, son vrai komi et la prochaine couleur déclarée', () => {
    const game = importSgf('(;HA[2]AB[dd][pp]KM[0.5];W[pd];B[qp];W[])', 'local-test', 'test.sgf');
    const from = studyStart(game, 1);
    expect(from).toEqual({
      recorded: p('qp'),
      position: {
        setupBlack: [p('dd'), p('pp')],
        komi: 0.5,
        moves: [{ color: 'W', point: p('pd') }],
        next: 'B',
      },
    });
    expect(studyStart(game, 0).position.next).toBe('W');
    expect(studyStart(game, 2).recorded).toBe(PASS);
    expect(studyStart(game, 3)).toMatchObject({ recorded: undefined, position: { next: 'B' } });
  });
});
