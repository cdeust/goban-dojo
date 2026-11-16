import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASS } from '../src/domain/board.ts';
import { buildTimeline, decodeMoves, decodePoints, type Dataset } from '../src/domain/game.ts';
import { CHAPTERS, MOMENTS, chapterIndexOf, gamesOfChapter } from '../src/story/chapters.ts';
import { ageAt, ageLabel, dateToTime, formatDate } from '../src/story/format.ts';

const root = join(import.meta.dirname, '..');
const dataset = JSON.parse(readFileSync(join(root, 'public/data/games.json'), 'utf8')) as Dataset;
const { games } = dataset;
const byId = new Map(games.map((g) => [g.id, g]));
const solo = games.filter((g) => !g.rengo);

describe('corpus source', () => {
  it('chaque fichier CWI porte l’empreinte SHA-256 inscrite au manifeste', () => {
    const rows = readFileSync(join(root, 'data/cwi.sha256'), 'utf8').split('\n').filter(Boolean);
    expect(rows).toHaveLength(470);
    const files = readdirSync(join(root, 'data/cwi')).sort();
    expect(files).toEqual(rows.map((r) => r.split(/\s+/)[1]).sort());
    for (const row of rows) {
      const [hash, name] = row.split(/\s+/) as [string, string];
      const bytes = readFileSync(join(root, 'data/cwi', name));
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(hash);
    }
  });

  it('chaque fichier PGD porte l’empreinte git annoncée par son manifeste', () => {
    const rows = readFileSync(join(root, 'data/pgd/sources.tsv'), 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(rows).toHaveLength(460);
    const shas = new Set(rows.map((r) => r.split('\t')[0]));
    const files = readdirSync(join(root, 'data/pgd/raw'));
    expect(new Set(files.map((f) => f.replace('.sgf', '')))).toEqual(shas);
    for (const f of files) {
      const bytes = readFileSync(join(root, 'data/pgd/raw', f));
      const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      expect(`${sha}.sgf`).toBe(f);
    }
  });
});

describe('jeu de données', () => {
  it('contient 469 parties distinctes, dans l’ordre chronologique', () => {
    expect(games).toHaveLength(469);
    expect(new Set(games.map((g) => g.id)).size).toBe(469);
    for (const g of games) expect([4, 7, 10], g.id).toContain(g.date.length);
    // Triées par date ; une date partielle est placée au milieu de sa période.
    const times = games.map((g) => dateToTime(g.date));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(games[0]?.date).toBe('1839-12-14');
    expect(games.at(-1)?.date).toBe('1862-06-19');
  });

  it('se rejoue intégralement sans le moindre coup illégal', () => {
    let total = 0;
    for (const g of games) {
      const moves = decodeMoves(g.moves);
      const t = buildTimeline(decodePoints(g.setupBlack), moves);
      expect(t.illegal, `${g.id} ${g.black} – ${g.white}`).toEqual([]);
      expect(moves.length).toBeGreaterThan(20);
      total += moves.length;
    }
    expect(total).toBe(85577);
  });

  it('Shūsaku figure dans chaque partie, du côté annoncé', () => {
    for (const g of games) {
      expect(g.shusaku === 'B' ? g.black : g.white, g.id).toMatch(/Shusaku|Yasuda Eisai/);
      expect(g.opponent, g.id).not.toMatch(/Shusaku|Eisai/);
      expect(g.sources[0]).toBe(`cwi:${g.id.slice(1)}`);
    }
    expect(games.filter((g) => g.rengo)).toHaveLength(4);
  });

  it('Noir commence, sauf dans les parties à handicap', () => {
    for (const g of games) {
      expect(g.moves.charAt(0), g.id).toBe(g.handicap > 0 ? 'w' : 'b');
      expect(decodePoints(g.setupBlack)).toHaveLength(g.handicap);
    }
  });

  it('ne garde aucune passe finale', () => {
    for (const g of games) expect(decodeMoves(g.moves).at(-1)?.point).not.toBe(PASS);
  });

  it('les dates partielles se mettent en forme et se placent sur la frise', () => {
    expect(formatDate('1846-09-11')).toBe('11 septembre 1846');
    expect(formatDate('1840-05-01')).toBe('1ᵉʳ mai 1840');
    expect(formatDate('1842-04')).toBe('avril 1842');
    expect(formatDate('1849')).toBe('1849');
    for (const g of games) {
      const t = dateToTime(g.date);
      expect(t).toBeGreaterThan(Date.UTC(1839, 0, 1));
      expect(t).toBeLessThan(Date.UTC(1863, 0, 1));
    }
  });
});

describe('âge de Shūsaku', () => {
  it('se calcule depuis sa naissance, le 6 juin 1829', () => {
    expect(ageAt('1839-12-14')).toEqual({ years: 10, approximate: false });
    expect(ageAt('1840-06-05').years).toBe(10);
    expect(ageAt('1840-06-06').years).toBe(11);
    expect(ageAt('1848-03-18').years).toBe(18);
    expect(ageAt('1862-06-19').years).toBe(33);
  });

  it('signale l’incertitude d’une date partielle', () => {
    // Avril : avant l'anniversaire quel que soit le jour.
    expect(ageAt('1842-04')).toEqual({ years: 12, approximate: false });
    // Juin : l'anniversaire tombe dans le mois.
    expect(ageAt('1845-06').approximate).toBe(true);
    expect(ageAt('1849')).toEqual({ years: 20, approximate: true });
    expect(ageLabel('1849')).toBe('vers 20 ans');
    expect(ageLabel('1839-12-14')).toBe('10 ans');
  });

  it('va de 10 à 33 ans sur l’ensemble du corpus', () => {
    const ages = games.map((g) => ageAt(g.date).years);
    expect(Math.min(...ages)).toBe(10);
    expect(Math.max(...ages)).toBe(33);
  });
});

describe('recoupement avec l’histoire', () => {
  it('les deux plus anciennes parties datent de décembre 1839, sous le nom de Yasuda Eisai', () => {
    expect(games.slice(0, 2).map((g) => [g.date, g.shusakuName, g.dateJapanese])).toEqual([
      ['1839-12-14', 'Yasuda Eisai', 'Tenpo 10-11-9'],
      ['1839-12-24', 'Yasuda Eisai', 'Tenpo 10-11-19'],
    ]);
  });

  it('les 19 parties du château sont là, toutes gagnées par Shūsaku, de 1849 à 1861', () => {
    const castle = games.filter((g) => g.event?.startsWith('Oshirogo'));
    expect(castle).toHaveLength(19);
    expect(castle.every((g) => g.result.winner === g.shusaku)).toBe(true);
    expect(castle[0]?.date).toBe('1849-12-31');
    expect(castle.at(-1)?.date).toBe('1861-12-18');
    // Le 17ᵉ jour du 11ᵉ mois lunaire tombe en décembre ou en janvier.
    for (const g of castle) expect(['12', '01']).toContain(g.date.slice(5, 7));
  });

  it('le sanjūbango compte 23 parties contre Ōta Yūzō, numérotées, et s’achève sur un jigo', () => {
    const match = games.filter((g) => g.event?.startsWith('Sanjūbango'));
    expect(match).toHaveLength(23);
    expect(match.every((g) => g.opponent === 'Ota Yuzo' && g.date.startsWith('1853'))).toBe(true);
    expect(match[0]?.event).toContain('1ʳᵉ partie');
    expect(match.at(-1)?.event).toContain('23ᵉ partie');
    expect(match.at(-1)?.result.winner).toBe('jigo');
  });

  it('la partie de l’oreille rouge : 325 coups, Noir gagne de 2 points, coup 127 en K11', () => {
    const g = byId.get('s126');
    expect(g).toMatchObject({ date: '1846-09-11', shusaku: 'B', opponent: 'Inoue Gennan Inseki' });
    expect(g?.sessions).toBe('1846-09-11,14,15');
    expect(g?.result).toMatchObject({ winner: 'B', margin: 2 });
    expect(g?.moves.length).toBe(325 * 3);
    expect(g?.moves.slice(126 * 3, 127 * 3)).toBe('bji');
    // Le lieu vient de la collection complémentaire.
    expect(g?.place).toContain('Tsuji Chujiro');
  });

  it('Shūsaku joue toujours Noir contre son maître Shūwa, en tête-à-tête', () => {
    const vsShuwa = solo.filter((g) => /Shuwa/.test(g.opponent));
    expect(vsShuwa.length).toBeGreaterThan(25);
    expect(vsShuwa.every((g) => g.shusaku === 'B')).toBe(true);
  });

  it('la dernière partie connue, le 19 juin 1862, est inachevée', () => {
    expect(games.at(-1)).toMatchObject({ id: 's471', opponent: 'Narabayashi Kurakichi' });
    expect(games.at(-1)?.result.winner).toBe('unfinished');
    expect((games.at(-1)?.moves.length ?? 0) / 3).toBe(38);
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

  it('range chaque partie dans un chapitre, et chaque chapitre a des parties', () => {
    for (const g of games) expect(chapterIndexOf(g), g.id).toBeGreaterThanOrEqual(0);
    const counts = CHAPTERS.map((_, i) => gamesOfChapter(games, i).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(469);
    expect(counts[0]).toBe(2);
    expect(counts.at(-1)).toBe(2);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('ne cite que des parties du bon chapitre et des coups qui existent', () => {
    CHAPTERS.forEach((c, i) => {
      for (const f of c.featured) {
        const g = byId.get(f.gameId);
        expect(g, `${c.id} → ${f.gameId}`).toBeDefined();
        if (g) expect(chapterIndexOf(g), `${c.id} → ${f.gameId}`).toBe(i);
      }
    });
    for (const m of MOMENTS) {
      const g = byId.get(m.gameId);
      expect(g).toBeDefined();
      expect(m.move).toBeLessThanOrEqual((g?.moves.length ?? 0) / 3);
    }
  });
});
