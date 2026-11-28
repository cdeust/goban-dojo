import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { opposite } from '../src/domain/board.ts';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { chainLiberties, schoolPosition } from '../src/domain/school.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import {
  advancedTacticQuestion,
  ladderContinuation,
  ladderProof,
  type AdvancedTacticExercise,
} from '../src/domain/advancedTactics.ts';
import { longLadderCatalog } from '../scripts/long-ladder-catalog.ts';
import { ALL_EXERCISES } from '../src/story/courseCatalog.ts';
import { RANK_FORMS } from '../src/story/rankCatalog.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';

const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as Dataset;
const byId = new Map(games.map((g) => [g.id, g]));
const cases = ALL_EXERCISES.filter((e) => e.module === 'long-ladder') as AdvancedTacticExercise[];

describe('Tsumego historique en plusieurs décisions', () => {
  it('reproduit 40 lectures de profondeur 11 à 25 sans fuite ni position artificielle', () => {
    const baseline = ALL_EXERCISES.filter((e) => e.module !== 'long-ladder');
    const exams = RANK_FORMS.flatMap((f) => f.items.map((i) => i.exercise));
    expect(longLadderCatalog(games, baseline, exams)).toEqual(cases);
    expect(cases).toHaveLength(40);
    expect(new Set(cases.map((e) => e.gameId)).size).toBe(40);
    const key = (e: { gameId: string; before: number }) => {
      const g = byId.get(e.gameId)!;
      return canonicalPosition(schoolPosition(g, e.before), decodeMoves(g.moves)[e.before]!.color);
    };
    const used = new Set([...baseline, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
    expect(cases.some((e) => e.horizon === 25)).toBe(true);
    for (const ex of cases) {
      expect(used.has(key(ex)), ex.id).toBe(false);
      used.add(key(ex));
      const game = byId.get(ex.gameId)!;
      const board = schoolPosition(game, ex.before);
      const proof = ladderProof(board, ex.color, ex.anchors[0]!, ex.candidate!, ex.horizon!);
      expect(proof).toEqual(ex.line);
      expect(proof?.length).toBe(ex.horizon);
      expect(
        ladderProof(board, ex.color, ex.anchors[0]!, ex.candidate!, ex.horizon! - 2),
      ).toBeNull();
      expect(advancedTacticQuestion(board, ex)).toContain(`${ex.horizon} demi-coups`);
      const wrong = chainLiberties(board, ex.anchors[0]!).find((p) => p !== ex.candidate)!;
      expect(ladderProof(board, ex.color, ex.anchors[0]!, wrong, ex.horizon!)).toBeNull();
    }
  }, 30_000);
  it('rejoint la capture terminale uniquement après les décisions réellement jouées', () => {
    for (const ex of cases) {
      const board = schoolPosition(byId.get(ex.gameId)!, ex.before);
      const t = ex.anchors[0]!;
      let offset = 0;
      while (offset < ex.line!.length) {
        expect(board.get(t)).toBe(opposite(ex.color));
        const p = ex.line![offset]!;
        const proof = ladderContinuation(board, ex.color, t, p, ex.horizon! - offset);
        expect(proof).toEqual(ex.line!.slice(offset));
        const attack = board.play(ex.color, p);
        expect(attack.illegal).toBeUndefined();
        if (attack.captures.includes(t)) {
          expect(offset + 1).toBe(ex.line!.length);
          expect(board.get(t)).toBeNull();
          break;
        }
        expect(board.get(t)).toBe(opposite(ex.color));
        expect(board.play(opposite(ex.color), proof![1]!).illegal).toBeUndefined();
        offset += 2;
      }
    }
  }, 30_000);
});
