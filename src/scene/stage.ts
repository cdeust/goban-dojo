import { createContext, useContext } from 'react';
import type { Color } from '../domain/board.ts';
import type { Pile } from './physics.ts';
import type { Players } from './players.ts';

/** Ce que le salon, une fois chargé, met à la disposition des pierres. */
export interface Stage {
  players: Players;
  /** Le couvercle de chaque joueur, où tombent ses prisonniers. */
  lids: Record<Color, Pile>;
}

export const StageContext = createContext<Stage | null>(null);

export function useStage(): Stage {
  const stage = useContext(StageContext);
  if (!stage) throw new Error('useStage : hors du salon');
  return stage;
}
