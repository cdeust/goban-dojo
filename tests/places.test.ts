import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UNTRANSLATED, translatePlace } from '../scripts/places.ts';

describe('traduction des lieux', () => {
  it.each([
    ['Edo Castle', 'Château d’Edo'],
    ['Residence of Lord Kugai of Inaba', 'Résidence du seigneur Kugai d’Inaba'],
    ['Residence of Ogawa Rokutaro.', 'Résidence d’Ogawa Rokutaro'],
    ['Home of Tanaka Hanbee, Yokkaichi', 'Maison de Tanaka Hanbee, Yokkaichi'],
    ['Hom eof Okada Hanbee', 'Maison d’Okada Hanbee'],
    ["Isseki-an {Ota Yuzo's house}", 'Isseki-an (maison d’Ota Yuzo)'],
    [
      'Ota residence {probably Lord Ota of Shima}',
      'Résidence Ota (probablement le seigneur Ota de Shima)',
    ],
    ['Misawa Village, Enshu Prov.', 'Village de Misawa, province d’Enshu'],
    ['Jikanji Temple, Onomichi', 'Temple Jikanji, Onomichi'],
    ['Honinbo household, Kurumazaka, Edo', 'Maison Hon’inbō, Kurumazaka, Edo'],
    ['Kyoto', 'Kyoto'],
  ])('%s → %s', (source, expected) => {
    expect(translatePlace(source)).toBe(expected);
  });

  it('aucun lieu du jeu de données ne garde de mot anglais', () => {
    const { games } = JSON.parse(readFileSync('public/data/games.json', 'utf8')) as {
      games: { id: string; place?: string }[];
    };
    const places = games.filter((g) => g.place);
    expect(places.length).toBeGreaterThan(190);
    for (const g of places) expect(g.place, g.id).not.toMatch(UNTRANSLATED);
  });
});
