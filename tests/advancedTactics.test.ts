import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POINTS, neighbours, opposite } from '../src/domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import {
  ADVANCED_TACTICS_MODULES,
  extractAdvancedTactics,
  judgeAdvancedTactic,
  safeEyes,
  snapbackProof,
  ladderProof,
  falseEyeCapture,
  advancedTacticSolution,
} from '../src/domain/advancedTactics.ts';

const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const games = new Map(data.games.map((g) => [g.id, g]));
const catalog = extractAdvancedTactics(data.games);
const position = (id: string, before: number) => {
  const game = games.get(id)!;
  return boardAt(decodePoints(game.setupBlack), decodeMoves(game.moves), before);
};
describe('Vie et tesuji vérifiables, positions historiques', () => {
  it('produit 144 positions diverses sans fabriquer un kifu', () => {
    expect(catalog).toHaveLength(144);
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    expect(new Set(catalog.map((e) => e.gameId)).size).toBeGreaterThan(50);
    for (const m of ADVANCED_TACTICS_MODULES)
      expect(catalog.filter((e) => e.module === m.id)).toHaveLength(24);
    for (const e of catalog) {
      const g = games.get(e.gameId)!;
      expect(g.imported).not.toBe(true);
      expect(g.sources.length).toBeGreaterThan(0);
      expect(decodeMoves(g.moves)[e.before]!.color).toBe(e.color);
      const board = position(e.gameId, e.before);
      expect(e.anchors.every((a) => board.get(a) !== null)).toBe(true);
      const before = board.positionKey();
      if (e.module !== 'two-eyes') {
        expect(judgeAdvancedTactic(board, e, e.candidate!)).toBe(true);
        expect(judgeAdvancedTactic(board, e, -1)).toBe(false);
        expect(judgeAdvancedTactic(board, e, POINTS)).toBe(false);
        expect(judgeAdvancedTactic(board, e, true)).toBe(false);
      }
      expect(advancedTacticSolution(board, e)).not.toContain('undefined');
      expect(board.positionKey()).toBe(before);
    }
  });
  it('certifie uniquement les deux yeux indépendants d’une même chaîne', () => {
    let yes = 0,
      no = 0;
    for (const e of catalog.filter((e) => e.module === 'two-eyes' || e.module === 'make-life')) {
      const board = position(e.gameId, e.before);
      const anchor = e.anchors[0]!;
      const prior = safeEyes(board, anchor);
      if (e.module === 'two-eyes') {
        const value = prior.length >= 2;
        expect(judgeAdvancedTactic(board, e, value)).toBe(true);
        expect(judgeAdvancedTactic(board, e, !value)).toBe(false);
        if (value) yes++;
        else no++;
        if (!value) continue;
      } else {
        expect(prior.length).toBeLessThan(2);
        expect(board.play(e.color, e.candidate!).illegal).toBeUndefined();
      }
      const eyes = safeEyes(board, anchor);
      expect(new Set(eyes).size).toBeGreaterThanOrEqual(2);
      const chain = board.stonesOf(anchor);
      for (const p of eyes) {
        expect(board.get(p)).toBeNull();
        expect(neighbours(p).every((q) => chain.includes(q))).toBe(true);
        expect(board.clone().play(opposite(board.get(anchor)!), p).illegal).toBe('suicide');
      }
    }
    expect(yes).toBe(12);
    expect(no).toBe(12);
  });
  it('rejoue indépendamment les trois demi-coups du sacrifice conditionnel', () => {
    for (const e of catalog.filter((e) => e.module === 'snapback')) {
      const board = position(e.gameId, e.before);
      const proof = snapbackProof(board, e.color, e.candidate!)!;
      expect(proof.reply).toBe(e.reply);
      expect(proof.finish).toBe(e.finish);
      const first = board.play(e.color, e.candidate!);
      expect(first.illegal).toBeUndefined();
      expect(first.captures).toHaveLength(0);
      expect(board.stonesOf(e.candidate!)).toEqual([e.candidate]);
      expect(board.libertyCount(e.candidate!)).toBe(1);
      const second = board.play(opposite(e.color), e.reply!);
      expect(second.illegal).toBeUndefined();
      expect(second.captures).toEqual([e.candidate]);
      const third = board.play(e.color, e.finish!);
      expect(third.illegal).toBeUndefined();
      expect(third.captures).toContain(e.reply);
      expect(third.captures.length).toBeGreaterThan(1);
    }
  });
  it('capture une chaîne adverse et sauve une chaîne propre déjà en atari', () => {
    for (const e of catalog.filter((e) => e.module === 'capture-race')) {
      const board = position(e.gameId, e.before);
      const [own, enemy] = e.anchors as [number, number];
      expect(board.get(own)).toBe(e.color);
      expect(board.get(enemy)).toBe(opposite(e.color));
      expect(board.libertyCount(own)).toBe(1);
      const chain = board.stonesOf(enemy);
      const result = board.play(e.color, e.candidate!);
      expect(result.illegal).toBeUndefined();
      expect(chain.every((p) => result.captures.includes(p))).toBe(true);
      expect(board.get(own)).toBe(e.color);
      expect(board.libertyCount(own)).toBeGreaterThanOrEqual(2);
    }
  });
  it('démasque seulement les faux yeux dont la capture est vérifiable et laisse une chaîne adverse distincte', () => {
    for (const e of catalog.filter((e) => e.module === 'false-eye')) {
      const b = position(e.gameId, e.before);
      const answer = e.candidate!;
      const marked = b.stonesOf(e.anchors[0]!);
      expect(neighbours(answer).every((p) => b.get(p) === opposite(e.color))).toBe(true);
      expect(neighbours(answer).some((p) => marked.includes(p))).toBe(true);
      expect(neighbours(answer).some((p) => !marked.includes(p))).toBe(true);
      expect(falseEyeCapture(b, e.color, answer, e.anchors[0]!)).toBe(true);
      const res = b.play(e.color, answer);
      expect(res.illegal).toBeUndefined();
      expect(marked.every((p) => res.captures.includes(p))).toBe(true);
      expect(neighbours(answer).some((p) => b.get(p) === opposite(e.color))).toBe(true);
    }
  });
  it('prouve les escaliers jusqu’à neuf demi-coups et rejoue leur défense longue', () => {
    const allPoints = Array.from({ length: POINTS + 1 }, (_, i) => i - 1);
    for (const e of catalog.filter((e) => e.module === 'ladder')) {
      const b = position(e.gameId, e.before);
      const target = e.anchors[0]!;
      const color = e.color;
      const first = e.candidate!;
      expect(b.libertyCount(target)).toBe(2);
      const line = e.line!;
      expect(line).toEqual(ladderProof(b, color, target, first));
      expect(line[0]).toBe(first);
      expect(line.length).toBeGreaterThanOrEqual(5);
      expect(line.length).toBeLessThanOrEqual(9);
      expect(ladderProof(b, color, target, first, 3)).toBeNull();
      let extensions = 0;
      let captured = false;
      for (const [i, p] of line.entries()) {
        const res = b.play(i % 2 === 0 ? color : opposite(color), p);
        expect(res.illegal).toBeUndefined();
        if (i % 2 === 0) {
          if (i === line.length - 1) captured = res.captures.includes(target);
          else expect(b.libertyCount(target)).toBe(1);
        } else if (b.stonesOf(target).includes(p)) extensions++;
      }
      expect(extensions).toBeGreaterThanOrEqual(2);
      expect(captured).toBe(true);
      // Independently check the first ply against all legal replies, including pass.
      const after = position(e.gameId, e.before);
      expect(after.play(color, first).illegal).toBeUndefined();
      for (const p of allPoints) {
        const defended = after.clone();
        if (defended.play(opposite(color), p).illegal) continue;
        const remaining = defended.libertyCount(target);
        const libs = [
          ...new Set(
            defended
              .stonesOf(target)
              .flatMap(neighbours)
              .filter((q) => defended.get(q) === null),
          ),
        ];
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(2);
        if (remaining === 1) {
          const taken = defended.clone().play(color, libs[0]!);
          // If recapture is prevented by simple ko, no direct proof is possible.
          expect(taken.illegal).toBeUndefined();
          expect(taken.captures).toContain(target);
        } else {
          expect(libs.some((q) => ladderProof(defended, color, target, q, 7) !== null)).toBe(true);
        }
      }
    }
  });
});
