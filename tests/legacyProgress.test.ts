import { describe, expect, it } from 'vitest';
import { legacyProgress } from '../src/state/legacyProgress.ts';

describe('migration des données historiques', () => {
  it('préserve un catalogue valide et ignore les données corrompues sans rien modifier', () => {
    const practice = JSON.stringify({
      version: 1,
      xp: 3,
      days: [20785],
      cards: [{ gameId: 's001', before: 0, stage: 1, due: 20786 }],
    });
    const storage = new Map([
      ['goban-dojo:practice', practice],
      ['goban-dojo:school:v1', '{invalid'],
    ]);
    expect(legacyProgress({ getItem: (key) => storage.get(key) ?? null })).toEqual({ practice });
    expect(storage.size).toBe(2);
  });
});
