import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board, POINTS, opposite } from '../src/domain/board.ts';
import {
  ENDGAME_MODULES,
  extractEndgame,
  judgeEndgame,
  countJapaneseScore,
} from '../src/domain/endgameCourse.ts';
import {
  buildTimeline,
  decodeMoves,
  decodePoints,
  prisonersAt,
  type Dataset,
} from '../src/domain/game.ts';
import { schoolPosition, emptyRegion } from '../src/domain/school.ts';

const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const games = new Map(data.games.map((game) => [game.id, game]));
const catalog = extractEndgame(data.games);

describe('Yose dans les kifus historiques', () => {
  it('produit 160 questions stables et diversifiées dans la carrière sans positions inventées', () => {
    expect(extractEndgame(data.games)).toEqual(catalog);
    expect(catalog).toHaveLength(160);
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    for (const m of ENDGAME_MODULES)
      expect(catalog.filter((e) => e.module === m.id)).toHaveLength(32);
    const dates = catalog.map((e) => Number(games.get(e.gameId)!.date.slice(0, 4)));
    expect(Math.min(...dates)).toBeLessThanOrEqual(1840);
    expect(Math.max(...dates)).toBeGreaterThanOrEqual(1860);
    expect(
      new Set(catalog.filter((e) => e.module === 'yose-captures').map((e) => e.answer)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      new Set(catalog.filter((e) => e.module === 'yose-boundary').map((e) => e.answer)).size,
    ).toBe(3);
    expect(catalog.filter((e) => e.module === 'yose-value').some((e) => e.answer === 0)).toBe(true);
    expect(extractEndgame(data.games, 0)).toEqual([]);
  });
  it('vérifie chaque réponse par relecture légale et par les fonctions indépendantes du domaine', () => {
    for (const e of catalog) {
      const game = games.get(e.gameId)!;
      const moves = decodeMoves(game.moves);
      const timeline = buildTimeline(decodePoints(game.setupBlack), moves);
      expect(timeline.illegal).toEqual([]);
      const board = schoolPosition(game, e.before);
      const original = board.positionKey();
      const move = moves[e.before]!;
      expect(e.before).toBeGreaterThanOrEqual(Math.max(120, Math.floor(0.7 * moves.length)));
      expect(e.candidate).toBe(move.point);
      expect(e.color).toBe(move.color);
      expect(e.id).toBe(`${e.module}:${game.id}:${e.before}`);
      expect(e.choices.map((c) => c.value)).toContain(e.answer);
      expect(judgeEndgame(e, e.answer).correct).toBe(true);
      expect(judgeEndgame(e, e.answer + 1).correct).toBe(false);
      expect(game.sources.length).toBeGreaterThan(0);
      const after = board.clone();
      const result = after.play(move.color, move.point);
      expect(result.illegal).toBeUndefined();
      const beforeCaptures = prisonersAt(timeline, e.before);
      const afterCaptures = prisonersAt(timeline, e.before + 1);
      const geometric = (b: Board, prisoners: { B: number; W: number }) => {
        const total = { ...prisoners };
        const seen = new Set<number>();
        for (let p = 0; p < POINTS; p++) {
          if (b.get(p) !== null || seen.has(p)) continue;
          const region = emptyRegion(b, p);
          for (const point of region.points) seen.add(point);
          if (region.border.size === 1) total[[...region.border][0]!] += region.points.length;
        }
        return total;
      };
      if (e.module === 'yose-captures') expect(e.answer).toBe(result.captures.length);
      else if (e.module === 'yose-prisoners') expect(e.answer).toBe(afterCaptures[e.color]);
      else if (e.module === 'yose-boundary') {
        const region = emptyRegion(board, e.candidate);
        expect(e.answer).toBe(region.border.size === 2 ? 3 : region.border.has('B') ? 1 : 2);
      } else {
        const a = geometric(board, beforeCaptures);
        const b = geometric(after, afterCaptures);
        if (e.module === 'yose-count') {
          expect(e.answer).toBe(a.B - a.W);
          expect(e.explanation).toContain('komi');
          if (game.komi === undefined) expect(e.explanation).toContain('aucun score final');
        } else {
          expect(e.answer).toBe(
            b[e.color] - b[opposite(e.color)] - a[e.color] + a[opposite(e.color)],
          );
        }
      }
      expect(board.positionKey()).toBe(original);
    }
  });
});

describe('Décompte japonais conditionnel', () => {
  // Minimal geometry fixtures exercise the scoring algorithm, not the historical curriculum.
  const corners = () => {
    const board = new Board();
    for (const p of [1, 19]) board.setup(p, 'B');
    for (const p of [359, 341]) board.setup(p, 'W');
    return board;
  };
  it('compte territoires, prisonniers, komi, neutres sans modifier le goban', () => {
    const board = corners();
    const original = board.positionKey();
    const score = countJapaneseScore(board, { B: 4, W: 2 }, { dead: [], seki: [], komi: 1.5 });
    expect(score.territory).toEqual({ B: 1, W: 1 });
    expect(score.neutral).toBe(355);
    expect(score.points).toEqual({ B: 5, W: 4.5 });
    expect(score.winner).toBe('B');
    expect(score.margin).toBe(0.5);
    expect(board.positionKey()).toBe(original);
  });
  it('exclut les zones bordées par les chaînes expressément déclarées en seki', () => {
    const score = countJapaneseScore(
      corners(),
      { B: 0, W: 0 },
      { dead: [], seki: [1, 19], komi: 0 },
    );
    expect(score.territory).toEqual({ B: 0, W: 1 });
    expect(score.neutral).toBe(356);
    expect(score.winner).toBe('W');
  });
  it('retire la chaîne morte entière une seule fois puis l’ajoute aux prisonniers adverses', () => {
    const board = new Board();
    for (const p of [2, 19, 20, 21]) board.setup(p, 'B');
    for (const p of [0, 1]) board.setup(p, 'W');
    for (const p of [359, 341]) board.setup(p, 'W');
    const original = board.positionKey();
    const score = countJapaneseScore(board, { B: 3, W: 0 }, { dead: [0, 1, 0], seki: [], komi: 6 });
    expect(score.agreedDead).toEqual({ B: 0, W: 2 });
    expect(score.territory).toEqual({ B: 2, W: 1 });
    expect(score.prisoners).toEqual({ B: 5, W: 0 });
    expect(score.points).toEqual({ B: 7, W: 7 });
    expect(score.winner).toBe('jigo');
    expect(board.positionKey()).toBe(original);
  });
  it('refuse le retrait automatique d’une pierre morte hors du territoire adverse', () => {
    const board = corners();
    board.setup(180, 'W');
    expect(() =>
      countJapaneseScore(board, { B: 0, W: 0 }, { dead: [180], seki: [], komi: 0 }),
    ).toThrow('hors du territoire adverse');
  });
  it('refuse les accords incohérents et le komi inconnu', () => {
    const board = corners();
    expect(() =>
      countJapaneseScore(board, { B: 0, W: 0 }, { dead: [], seki: [], komi: NaN }),
    ).toThrow();
    expect(() =>
      countJapaneseScore(board, { B: -1, W: 0 }, { dead: [], seki: [], komi: 0 }),
    ).toThrow();
    expect(() =>
      countJapaneseScore(board, { B: 0, W: 0 }, { dead: [0], seki: [], komi: 0 }),
    ).toThrow();
    expect(() =>
      countJapaneseScore(board, { B: 0, W: 0 }, { dead: [1], seki: [1], komi: 0 }),
    ).toThrow();
  });
});
