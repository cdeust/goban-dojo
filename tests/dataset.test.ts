import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASS } from '../src/domain/board.ts';
import { buildTimeline, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { CHAPTERS, MOMENTS, chapterIndexOf, gamesOfChapter } from '../src/story/chapters.ts';

const root = join(import.meta.dirname, '..');
const dataset = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const { games } = dataset;
const byId = new Map(games.map((g) => [g.id, g]));

describe('corpus source', () => {
  it('chaque fichier brut porte l’empreinte git annoncée par data/sources.tsv', () => {
    const rows = readFileSync(join(root, 'data/sources.tsv'), 'utf8').split('\n').filter(Boolean);
    expect(rows).toHaveLength(460);
    const shas = new Set(rows.map((r) => r.split('\t')[0]));
    const files = readdirSync(join(root, 'data/raw'));
    expect(new Set(files.map((f) => f.replace('.sgf', '')))).toEqual(shas);
    for (const f of files) {
      const bytes = readFileSync(join(root, 'data/raw', f));
      const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      expect(`${sha}.sgf`).toBe(f);
    }
  });
});

describe('jeu de données', () => {
  it('contient 391 parties distinctes, triées par date', () => {
    expect(games).toHaveLength(391);
    expect(new Set(games.map((g) => g.id)).size).toBe(391);
    const dates = games.map((g) => g.date);
    expect([...dates].sort()).toEqual(dates);
    for (const g of games) expect(g.date).toMatch(/^18\d\d-\d\d-\d\d$/);
  });

  it('se rejoue intégralement sans le moindre coup illégal', () => {
    let total = 0;
    for (const g of games) {
      const moves = decodeMoves(g.moves);
      const t = buildTimeline(decodePoints(g.setupBlack), moves);
      expect(t.illegal, `${g.date} ${g.black} – ${g.white}`).toEqual([]);
      expect(moves.length).toBeGreaterThan(30);
      total += moves.length;
    }
    expect(total).toBe(75193);
  });

  it('Shūsaku figure dans chaque partie, du côté annoncé', () => {
    for (const g of games) {
      expect(g.shusaku === 'B' ? g.black : g.white).toMatch(/Shusaku/);
      expect(g.opponent).not.toMatch(/Shusaku/);
      expect(g.sources.length).toBeGreaterThan(0);
    }
  });

  it('Noir commence, sauf dans les parties à handicap', () => {
    for (const g of games) {
      expect(g.moves.charAt(0)).toBe(g.handicap > 0 ? 'w' : 'b');
      expect(decodePoints(g.setupBlack)).toHaveLength(g.handicap);
    }
  });

  it('ne garde aucune passe finale', () => {
    for (const g of games) expect(decodeMoves(g.moves).at(-1)?.point).not.toBe(PASS);
  });
});

describe('recoupement avec l’histoire', () => {
  it('les 19 parties du château sont là, toutes gagnées par Shūsaku, de 1849 à 1861', () => {
    const castle = games.filter((g) => g.event?.startsWith('Oshirogo'));
    expect(castle).toHaveLength(19);
    expect(castle.every((g) => g.result.winner === g.shusaku)).toBe(true);
    expect(castle[0]?.date.slice(0, 4)).toBe('1849');
    expect(castle.at(-1)?.date.slice(0, 4)).toBe('1861');
    // Aucune partie du château en 1855 (séisme).
    expect(castle.some((g) => g.date.startsWith('1855'))).toBe(false);
  });

  it('le sanjūbango compte 23 parties contre Ōta Yūzō et s’achève sur un jigo', () => {
    const match = games.filter((g) => g.event?.startsWith('Sanjūbango'));
    expect(match).toHaveLength(23);
    expect(match.every((g) => g.opponent === 'Ota Yuzo' && g.date.startsWith('1853'))).toBe(true);
    expect(match.at(-1)?.result.winner).toBe('jigo');
  });

  it('la partie de l’oreille rouge : 325 coups, Noir gagne de 2 points, coup 127 en K11', () => {
    const g = byId.get('2d229bca26');
    expect(g).toMatchObject({ date: '1846-09-11', shusaku: 'B', opponent: 'Inoue Gennan Inseki' });
    expect(g?.result).toMatchObject({ winner: 'B', margin: 2 });
    expect(g?.moves.length).toBe(325 * 3);
    expect(g?.moves.slice(126 * 3, 127 * 3)).toBe('bji');
  });

  it('Shūsaku joue toujours Noir contre son maître Shūwa', () => {
    const vsShuwa = games.filter((g) => g.opponent === 'Honinbo Shuwa');
    expect(vsShuwa.length).toBeGreaterThan(20);
    expect(vsShuwa.every((g) => g.shusaku === 'B')).toBe(true);
  });
});

describe('récit', () => {
  it('couvre 1829-1862 sans trou ni chevauchement', () => {
    expect(CHAPTERS[0]?.from).toBe(1829);
    expect(CHAPTERS.at(-1)?.to).toBe(1862);
    for (let i = 1; i < CHAPTERS.length; i++) {
      expect(CHAPTERS[i]?.from).toBe((CHAPTERS[i - 1]?.to ?? 0) + 1);
    }
  });

  it('range chaque partie dans un chapitre, hors dates douteuses', () => {
    const suspect = games.filter((g) => g.dateSuspect);
    expect(suspect).toHaveLength(2);
    for (const g of games) expect(chapterIndexOf(g) === -1).toBe(Boolean(g.dateSuspect));
    const counted = CHAPTERS.reduce((n, _, i) => n + gamesOfChapter(games, i).length, 0);
    expect(counted).toBe(391 - 2);
    // L'enfance et l'année de sa mort n'ont laissé aucune partie.
    expect(gamesOfChapter(games, 0)).toHaveLength(0);
    expect(gamesOfChapter(games, CHAPTERS.length - 1)).toHaveLength(0);
  });

  it('ne cite que des parties et des coups qui existent', () => {
    for (const c of CHAPTERS) {
      for (const f of c.featured) expect(byId.has(f.gameId), `${c.id} → ${f.gameId}`).toBe(true);
    }
    for (const m of MOMENTS) {
      const g = byId.get(m.gameId);
      expect(g).toBeDefined();
      expect(m.move).toBeLessThanOrEqual((g?.moves.length ?? 0) / 3);
    }
  });
});
