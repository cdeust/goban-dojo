import { describe, expect, it } from 'vitest';
import {
  dueReviews,
  emptyPractice,
  MASTERY,
  practiceDay,
  recentDays,
  recordRecall,
} from '../src/domain/practice.ts';
import { decodePractice } from '../src/state/practice.ts';

describe('Carnet du dojo', () => {
  it('espace les rappels réussis et conserve le palier sur un rappel de maintien', () => {
    let practice = emptyPractice();
    let day = 20_000;
    for (const [index, delay] of [1, 3, 7, 14, 30, 30].entries()) {
      practice = recordRecall(practice, 's126', 126, 'exact', day);
      expect(practice.cards).toEqual([
        { gameId: 's126', before: 126, due: day + delay, stage: Math.min(index + 1, MASTERY) },
      ]);
      expect(dueReviews(practice, day + delay - 1)).toEqual([]);
      expect(dueReviews(practice, day + delay)).toEqual(practice.cards);
      day += delay;
    }
    expect(practice.xp).toBe(18);
  });

  it('évite le gain répété, et programme une réponse aidée ou révélée pour demain', () => {
    const start = recordRecall(emptyPractice(), 's126', 126, 'exact', 20_000);
    expect(recordRecall(start, 's126', 126, 'exact', 20_000)).toBe(start);
    const assisted = recordRecall(start, 's126', 126, 'assisted', 20_001);
    expect(assisted.cards[0]).toMatchObject({ stage: 0, due: 20_002 });
    expect(assisted.xp).toBe(4);
    const shown = recordRecall(assisted, 's127', 126, 'shown', 20_001);
    expect(shown.cards[1]).toMatchObject({ stage: 0, due: 20_002 });
    expect(shown.xp).toBe(4);
    expect(shown.days).toEqual([20_000, 20_001]);
    expect(recentDays(shown, 20_007)).toEqual([true, false, false, false, false, false, false]);
  });

  it('compte en jours civils locaux y compris le week-end de changement d’heure', () => {
    expect(
      practiceDay(new Date(2026, 2, 30, 0, 1)) - practiceDay(new Date(2026, 2, 29, 23, 59)),
    ).toBe(1);
  });

  it('restaure un carnet complet ; ignore une version inconnue, un doublon ou une date invalide', () => {
    const profile = recordRecall(emptyPractice(), 's126', 126, 'exact', 20_000);
    const roundTrip = (value: unknown) => decodePractice(JSON.stringify(value));
    expect(roundTrip(profile)).toEqual(profile);
    expect(roundTrip({ ...profile, version: 2 })).toEqual(emptyPractice());
    expect(roundTrip({ ...profile, days: [20_000, 20_000] })).toEqual(emptyPractice());
    expect(roundTrip({ ...profile, cards: [...profile.cards, ...profile.cards] })).toEqual(
      emptyPractice(),
    );
    expect(roundTrip({ ...profile, cards: [{ ...profile.cards[0], due: 'demain' }] })).toEqual(
      emptyPractice(),
    );
  });
});
