import { describe, expect, it } from 'vitest';
import { importSgf } from '../src/domain/importSgf.ts';
import type { HistoricalGameRecord } from '../src/domain/game.ts';
import { mentorsOf } from '../src/story/mentors.ts';

function imported(id: string, players: string, date = '') {
  return importSgf(`(;SZ[19]${players}DT[${date}];B[aa])`, id, id + '.sgf');
}

describe('parcours des joueurs des SGF', () => {
  it('regroupe les deux couleurs, préserve le nom, trie les dates et garde les index du catalogue', () => {
    const first = imported('a', 'PB[Seo  Bong-su]PW[Émile]');
    const second = imported('b', 'PB[Noir]PW[SEO Bong-su]', '2022-03');
    const third = imported('c', 'PB[Seo Bong-su]PW[Seo Bong-su]', '2001');
    const corpus: HistoricalGameRecord = {
      ...first,
      imported: false,
      id: 's001',
      shusaku: 'B',
      shusakuName: 'Shusaku',
      opponent: 'Émile',
    };
    const list = mentorsOf([corpus, first, second, third]);
    expect(list.map((p) => p.name)).toEqual(['Émile', 'Seo Bong-su']);
    expect(list[1]?.games.map(({ game, index }) => [game.id, index])).toEqual([
      ['c', 3],
      ['b', 2],
      ['a', 1],
    ]);
  });

  it('écarte les valeurs de repli et conserve les accents qui distinguent deux noms', () => {
    expect(mentorsOf([imported('a', ''), imported('b', 'PB[UNKNOWN]PW[?]')])).toEqual([]);
    const list = mentorsOf([imported('c', 'PB[Émile]PW[Emile]')]);
    expect(list).toHaveLength(2);
  });
});
