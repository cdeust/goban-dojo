/** Un jour civil local, exprimé en jours depuis 1970 (sans journées de 23 ou 25 h). */
export function practiceDay(date = new Date()): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export const REVIEW_INTERVALS = [1, 1, 3, 7, 14, 30] as const;
export const MASTERY = REVIEW_INTERVALS.length - 1;
export const MAX_CARDS = 12_000;
export const MAX_DAYS = 20_000;

export interface PracticeCard {
  gameId: string;
  /** Index zéro-based du coup à retrouver, donc nombre de coups déjà affichés. */
  before: number;
  stage: number;
  due: number;
}

export interface Practice {
  version: 1;
  xp: number;
  days: number[];
  cards: PracticeCard[];
}

export const emptyPractice = (): Practice => ({ version: 1, xp: 0, days: [], cards: [] });

export type Recall = 'exact' | 'assisted' | 'shown';

/**
 * Seule une position nouvelle ou arrivée à échéance crédite le carnet. Un coup
 * réussi sans indice monte d'un palier ; avec aide, il revient le lendemain.
 */
export function recordRecall(
  current: Practice,
  gameId: string,
  before: number,
  recall: Recall,
  today: number,
): Practice {
  const index = current.cards.findIndex((card) => card.gameId === gameId && card.before === before);
  const previous = current.cards[index];
  if (previous && previous.due > today) return current;
  if (!previous && current.cards.length >= MAX_CARDS) return current;
  const stage = recall === 'exact' ? Math.min(MASTERY, (previous?.stage ?? 0) + 1) : 0;
  const card = { gameId, before, stage, due: today + REVIEW_INTERVALS[stage]! };
  const cards = current.cards.slice();
  if (previous) cards[index] = card;
  else cards.push(card);
  const days = current.days.includes(today)
    ? current.days
    : [...current.days, today].sort((a, b) => a - b).slice(-MAX_DAYS);
  return {
    version: 1,
    cards,
    days,
    xp: current.xp + (recall === 'exact' ? 3 : recall === 'assisted' ? 1 : 0),
  };
}

export function dueReviews(practice: Practice, today: number): PracticeCard[] {
  return practice.cards
    .filter((card) => card.due <= today)
    .sort((a, b) => a.due - b.due || a.stage - b.stage);
}

export function recentDays(practice: Practice, today: number): boolean[] {
  const active = new Set(practice.days);
  return Array.from({ length: 7 }, (_, i) => active.has(today - 6 + i));
}

export const PRACTICE_LEVELS = [
  { name: 'Premiers pas', xp: 0 },
  { name: 'Apprenti du dojo', xp: 15 },
  { name: 'Lecteur de kifu', xp: 60 },
  { name: 'Compagnon du dojo', xp: 180 },
  { name: 'Gardien des kifu', xp: 450 },
  { name: 'Mémoire du goban', xp: 1000 },
] as const;
