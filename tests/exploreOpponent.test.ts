import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASS, POINTS, pointFromSgf as p } from '../src/domain/board.ts';
import type { Dataset, GameRecord } from '../src/domain/game.ts';
import type { ZeroRequest, ZeroResponse } from '../src/engine/zeroProtocol.ts';
import type { ZeroResult } from '../src/engine/zeroSearch.ts';
import { playExploreReply } from '../src/replay/useExploreOpponent.ts';
import {
  exploreFinished,
  exploreReplyTo,
  MAX_VARIATION,
  nextColor,
  useStore,
} from '../src/state/store.ts';

const fixture = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
const handicap: GameRecord = {
  ...fixture.games[0]!,
  setupBlack: 'ddpd',
  handicap: 2,
  komi: 0.5,
  moves: 'wcqbppwqp',
};
const state = useStore.getState;
const signal = () => new AbortController().signal;
const choices = (...points: number[]): ZeroResult => ({
  visits: 32,
  choices: points.map((point) => ({ point, line: [point], blackWin: 0.5, visits: 1 })),
});

beforeEach(() => {
  useStore.setState({
    ...useStore.getInitialState(),
    dataset: { ...fixture, games: [handicap, fixture.games[1]!] },
  });
  state().setMode('explorer');
});
afterEach(() => vi.unstubAllGlobals());

describe('Exercice contre Leela Zero', () => {
  it('recherche sur le véritable trait, le handicap et tout l’historique puis joue la première réponse', async () => {
    const messages: ZeroRequest[] = [];
    class WorkerStub {
      onmessage?: (e: { data: ZeroResponse }) => void;
      postMessage(message: ZeroRequest) {
        messages.push(message);
      }
      terminate() {}
    }
    const worker = new WorkerStub();
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          return worker;
        }
      },
    );
    expect(state().exploreOpponent).toBe(true);
    state().setMove(2);
    expect(nextColor(state())).toBe('W');
    state().clickPoint(p('dd'));
    expect(exploreReplyTo(state())).toBeNull();
    state().clickPoint(p('ee'));
    const branch = state().variation;
    state().clickPoint(p('jj'));
    state().clickPoint(PASS);
    expect(state().variation).toBe(branch);
    const reply = playExploreReply(branch, signal());
    const query = messages.find((m) => m.type === 'search');
    expect(query).toMatchObject({
      visits: 32,
      position: {
        setupBlack: [p('dd'), p('pd')],
        komi: 0.5,
        next: 'B',
        moves: [
          { color: 'W', point: p('cq') },
          { color: 'B', point: p('pp') },
          { color: 'W', point: p('ee') },
        ],
      },
    });
    worker.onmessage!({
      data: { type: 'result', id: query!.id, result: choices(p('jd'), p('jj')) },
    });
    await reply;
    expect(state().variation).toEqual([
      { color: 'W', point: p('ee'), playedBy: 'human' },
      { color: 'B', point: p('jd'), playedBy: 'leela' },
    ]);
    expect(nextColor(state())).toBe('W');
    state().clickPoint(p('jj'));
    const controller = new AbortController();
    const second = playExploreReply(state().variation, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    const lastQuery = messages.filter((m) => m.type === 'search').at(-1)!;
    expect(messages.at(-1)).toEqual({ type: 'cancel', id: lastQuery.id });
    state().undoVariation();
    worker.onmessage!({ data: { type: 'result', id: lastQuery.id, result: choices(PASS) } });
    expect(state().variation).toHaveLength(2);
    state().undoVariation();
    expect(state().variation).toEqual([]);
    expect(handicap.moves).toBe('wcqbppwqp');
  });

  it('garde les auteurs en libre et place le prochain coup humain à la couleur au trait', async () => {
    state().clickPoint(p('ee'));
    await playExploreReply(state().variation, signal(), async () => choices(p('jj')));
    state().setExploreOpponent(false);
    expect(state().variation.map((m) => m.playedBy)).toEqual(['human', 'leela']);
    state().clickPoint(p('aa'));
    expect(state().variation.at(-1)).toEqual({ color: 'W', point: p('aa') });
    state().setExploreOpponent(true);
    expect(exploreReplyTo(state())).toBeNull();
    state().clickPoint(PASS);
    expect(state().variation.at(-1)).toEqual({ color: 'B', point: PASS, playedBy: 'human' });
    await playExploreReply(state().variation, signal(), async () => choices(PASS));
    expect(exploreFinished(state())).toBe(true);
    expect(exploreReplyTo(state())).toBeNull();
    state().clickPoint(p('ab'));
    expect(state().notice).toContain('Deux passes');
    state().undoVariation();
    expect(state().variation.at(-1)).toEqual({ color: 'W', point: p('aa') });
    expect(exploreFinished(state())).toBe(false);
    state().setExploreOpponent(false);
    state().undoVariation();
    expect(state().variation.map((m) => m.playedBy)).toEqual(['human', 'leela']);
  });

  it('reconnaît la deuxième passe après une passe du kifu, y compris sur la racine', () => {
    const game = { ...handicap, moves: 'w--b--' };
    useStore.setState({ dataset: { ...fixture, games: [game] } });
    state().setMove(1);
    state().clickPoint(PASS);
    expect(exploreFinished(state())).toBe(true);
    expect(exploreReplyTo(state())).toBeNull();
    state().clearVariation();
    state().setMove(2);
    expect(exploreFinished(state())).toBe(true);
    state().clickPoint(p('aa'));
    expect(state().variation).toEqual([]);
  });

  it('arrête la recherche à la longueur maximale et laisse reprendre le dernier coup', () => {
    state().setExploreOpponent(false);
    for (let point = 0; point < POINTS && state().variation.length < MAX_VARIATION - 1; point++)
      state().clickPoint(point);
    state().setExploreOpponent(true);
    state().clickPoint(PASS);
    expect(state().variation).toHaveLength(MAX_VARIATION);
    expect(exploreFinished(state())).toBe(true);
    expect(exploreReplyTo(state())).toBeNull();
    state().undoVariation();
    expect(exploreFinished(state())).toBe(false);
  });

  it('garde la branche pour une relance après une erreur moteur ou une réponse illégale', async () => {
    state().clickPoint(p('ee'));
    const branch = state().variation;
    const broken = new Error('Interruption WASM');
    await expect(
      playExploreReply(branch, signal(), async () => {
        throw broken;
      }),
    ).rejects.toBe(broken);
    for (const result of [choices(), choices(p('ee'))]) {
      await expect(playExploreReply(branch, signal(), async () => result)).rejects.toThrow(
        /réponse légale/,
      );
      expect(state().variation).toBe(branch);
    }
    await playExploreReply(branch, signal(), async () => choices(p('jj')));
    expect(state().variation.at(-1)).toEqual({ color: 'B', point: p('jj'), playedBy: 'leela' });
  });

  it.each(['annulation', 'position', 'partie', 'mode', 'jeu libre', 'relance'])(
    'ignore une réponse tardive après %s',
    async (change) => {
      state().clickPoint(p('ee'));
      const old = state().variation;
      const controller = new AbortController();
      let deliver!: (r: ZeroResult) => void;
      const pending = playExploreReply(
        old,
        controller.signal,
        () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      );
      if (change === 'annulation') {
        state().undoVariation();
        state().clickPoint(p('ee'));
      }
      if (change === 'position') state().setMove(2);
      if (change === 'partie') state().selectGame(1);
      if (change === 'mode') state().setMode('lecture');
      if (change === 'jeu libre') {
        state().setExploreOpponent(false);
        state().setExploreOpponent(true);
      }
      if (change === 'relance') {
        controller.abort();
        await playExploreReply(old, signal(), async () => choices(p('jj')));
      }
      const current = state().variation;
      deliver(choices(p('aa')));
      await pending;
      expect(state().variation).toBe(current);
    },
  );
});
