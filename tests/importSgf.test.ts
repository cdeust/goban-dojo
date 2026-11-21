import { dateToTime, formatDate } from '../src/story/format.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importSgf } from '../src/domain/importSgf.ts';
import { decodeMoves, decodePoints } from '../src/domain/game.ts';
import { pointToHuman } from '../src/domain/board.ts';
import { localGames, saveGame } from '../src/state/localGames.ts';
import { reflectionsOf } from '../src/state/reflections.ts';
import { reflectionMoves } from '../src/story/reflections.ts';

describe('import SGF', () => {
  it('conserve joueurs, komi, handicap, passes et première variante', () => {
    const game = importSgf(
      '(;FF[4]GM[1]SZ[19]PB[Alice]PW[Émile]KM[6.5]DT[2026-10-19,20]HA[2]AB[dd][pp]RE[W+2.5];W[pd](;B[];W[dp])(;B[dc]))',
      'local-test',
      'Forum.sgf',
    );
    expect(game).toMatchObject({
      black: 'Alice',
      white: 'Émile',
      komi: 6.5,
      date: '2026-10-19',
      handicap: 2,
      event: 'Forum',
      imported: true,
      result: { winner: 'W', margin: 2.5 },
    });
    expect(decodePoints(game.setupBlack).map(pointToHuman)).toEqual(['D16', 'Q4']);
    expect(decodeMoves(game.moves).map(({ point }) => pointToHuman(point))).toEqual([
      'Q16',
      'passe',
      'D4',
    ]);
  });

  it.each([
    ['1985', '1985'],
    ['1985-03', 'mars 1985'],
    ['1985-03-01', '1ᵉʳ mars 1985'],
    ['0085-03', 'mars 85'],
    ['2000-02-29', '29 février 2000'],
  ])('respecte la précision et l’année de DT[%s]', (dt, expected) => {
    const game = importSgf(`(;DT[${dt}];B[dd])`, 'local-date', 'Kifu.sgf');
    expect(game.date).toBe(dt);
    expect(game.sessions).toBeUndefined();
    expect(formatDate(game.date)).toBe(expected);
    expect(new Date(dateToTime(game.date)).getUTCFullYear()).toBe(Number(dt.slice(0, 4)));
  });

  it.each([
    ['1996-05,06', 'mai 1996 et juin 1996'],
    ['1996-05-06,07,08', '6 mai 1996, 7 mai 1996 et 8 mai 1996'],
    ['1996,1997', '1996 et 1997'],
    [
      '1996-12-27,28,1997-01-03,04',
      '27 décembre 1996, 28 décembre 1996, 3 janvier 1997 et 4 janvier 1997',
    ],
    ['1985-01,02-28,03-01', 'janvier 1985, 28 février 1985 et 1ᵉʳ mars 1985'],
  ])('préserve toutes les séances de DT[%s]', (dt, expected) => {
    const game = importSgf(`(;DT[${dt}];B[dd])`, 'local-date', 'Kifu.sgf');
    expect(game.date).toBe(dt.split(',')[0]);
    expect(game.sessions).toBe(dt);
    expect(formatDate(game.sessions!)).toBe(expected);
  });

  it.each(['2023-02-29', '1985-00', '1985-03-00', '1985-4', 'mars 1985'])(
    'laisse la date inconnue pour DT[%s]',
    (dt) => {
      expect(importSgf(`(;DT[${dt}];B[dd])`, 'local-date', 'Kifu.sgf').date).toBe('');
      expect(formatDate(dt)).toBe(dt);
    },
  );

  it.each(['1985,03', '1985-03,32', '1985-02-28,29'])(
    'conserve une liste ambiguë telle que la source l’écrit : %s',
    (dt) => {
      const game = importSgf(`(;DT[${dt}];B[dd])`, 'local-date', 'Kifu.sgf');
      expect(game.date).toBe(dt.split(',')[0]);
      expect(game.sessions).toBe(dt);
      expect(formatDate(game.sessions!)).toBe(dt);
    },
  );

  it('indexe les deux degrés de TE sur les seuls coups de la première variante', () => {
    const game = importSgf(
      '(;FF[4]TE[1];B[pd]TE[1];C[Après le premier coup]TE[2](;W[dd];B[qp]TE[2])(;W[dp]TE[1]))',
      'local-te',
      'Tesuji.sgf',
    );
    expect(game.tesujis).toEqual([
      { number: 1, emphasis: 1 },
      { number: 3, emphasis: 2 },
    ]);
    const scenes = reflectionsOf(game);
    expect(scenes.map(({ after, tesuji }) => [after, tesuji])).toEqual([
      [0, 1],
      [2, 2],
    ]);
    expect(scenes.every((scene) => !scene.tactical && !scene.sessionBreak)).toBe(true);
    for (const scene of scenes) {
      expect(reflectionMoves(game, scene.after, scene.lines[0]!)).toEqual([
        decodeMoves(game.moves)[scene.after],
      ]);
    }
  });

  it('garde une seule scène pour une capture de deux pierres aussi annotée TE', () => {
    const game = importSgf('(;B[ca];W[aa];B[bb];W[ba];B[ab]TE[1])', 'local-te', 'Capture.sgf');
    const scenes = reflectionsOf(game);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ after: 4, tesuji: 1, tactical: { number: 5 } });
    expect(scenes[0]!.tactical!.captures).toHaveLength(2);
  });

  it.each(['TE[0]', 'TE[3]', 'TE[]', 'TE[1][2]', 'TE[2]BM[1]', 'IT[]', 'BL[600]'])(
    'conserve le coup sans créer de scène pour %s',
    (property) => {
      const game = importSgf(`(;B[pd]${property})`, 'local-te', 'Test.sgf');
      expect(game.moves).toBe('bpd');
      expect(game.tesujis).toBeUndefined();
      expect(reflectionsOf(game)).toEqual([]);
    },
  );

  it.each([
    ['(;GM[2]SZ[19];B[pd])', /19 × 19/],
    ['(;SZ[9];B[cc])', /19 × 19/],
    ['(;SZ[19];B[pd]', /incomplet/],
    ['(;SZ[19];B[pd])(;SZ[19];B[qp])', /une seule partie/],
    ['(;SZ[19];B[pd];W[pd])', /coup illégal/],
    ['(;SZ[19]AW[dd];B[pd])', /position composée/],
    ['(;SZ[19]KM[absent];B[pd])', /komi/],
  ])('signale un fichier incompatible %s', (data, error) => {
    expect(() => importSgf(data, 'local-test', 'Partie.sgf')).toThrow(error);
  });
});

describe('réouverture des imports SGF', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('relit les anciens SGF et conserve le tesuji après enregistrement ou nouvel import', () => {
    const storage = new Map([
      [
        'goban.imports.v1',
        JSON.stringify([{ id: 'local-ancien', name: 'Simple.sgf', text: '(;B[dd])' }]),
      ],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    const text = '(;FF[4]GM[1]SZ[19];B[pd];W[dd];B[qp]TE[2])';
    const saved = saveGame(text, 'Trois coups.sgf');
    const [oldGame, reopened] = localGames();
    expect(oldGame!.id).toBe('local-ancien');
    expect(reflectionsOf(oldGame!)).toEqual([]);
    expect(reopened).toEqual(saved);
    expect(reflectionsOf(reopened!).map(({ after, tesuji }) => [after, tesuji])).toEqual([[2, 2]]);
    expect(saveGame(text, 'Copie.sgf')).toEqual(saved);
    expect(localGames()).toHaveLength(2);
  });
});
