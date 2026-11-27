import { emptyPractice, MASTERY, MAX_CARDS, MAX_DAYS, type Practice } from '../domain/practice.ts';

import { progressSession } from './sessionProgress.ts';
const NUMBERS = 'goban-dojo:numbers';
const MAX_BYTES = 2_000_000;

const int = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export function decodePractice(raw: string | null): Practice {
  if (!raw || raw.length > MAX_BYTES) return emptyPractice();
  try {
    const value = JSON.parse(raw) as Practice;
    if (
      value?.version !== 1 ||
      !int(value.xp, 0, Number.MAX_SAFE_INTEGER) ||
      !Array.isArray(value.days) ||
      value.days.length > MAX_DAYS ||
      !value.days.every(
        (day, i, days) => int(day, 0, 100_000) && (i === 0 || day > days[i - 1]!),
      ) ||
      !Array.isArray(value.cards) ||
      value.cards.length > MAX_CARDS
    )
      return emptyPractice();

    const seen = new Set<string>();
    for (const card of value.cards) {
      if (
        !card ||
        typeof card.gameId !== 'string' ||
        card.gameId.length < 1 ||
        card.gameId.length > 100 ||
        !int(card.before, 0, 524_288) ||
        !int(card.stage, 0, MASTERY) ||
        !int(card.due, 0, 100_000)
      )
        return emptyPractice();
      const id = JSON.stringify([card.gameId, card.before]);
      if (seen.has(id)) return emptyPractice();
      seen.add(id);
    }
    return value;
  } catch {
    return emptyPractice();
  }
}

export function loadPractice(): Practice {
  try {
    return decodePractice(progressSession().read('practice'));
  } catch {
    return emptyPractice();
  }
}

export function savePractice(profile: Practice): boolean {
  try {
    return progressSession().write('practice', JSON.stringify(profile));
  } catch {
    return false;
  }
}

export function loadNumbers(): boolean {
  try {
    return window.localStorage.getItem(NUMBERS) !== '0';
  } catch {
    return true;
  }
}

export function saveNumbers(show: boolean): void {
  try {
    window.localStorage.setItem(NUMBERS, show ? '1' : '0');
  } catch {
    // Le réglage reste utilisable pendant la session.
  }
}
