/** Deux transpositions attestées : mêmes pierres et même joueur au trait, deux priorités. */
export const OPENING_CASE = {
  first: { gameId: 's050', before: 6 },
  second: { gameId: 's052', before: 6 },
  length: 5,
} as const;
export const OPENING_CASE_POSITIONS = [OPENING_CASE.first, OPENING_CASE.second] as const;
