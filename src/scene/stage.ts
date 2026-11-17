import { createContext, useContext } from 'react';
import type { Color } from '../domain/board.ts';
import type { Pile } from './physics.ts';

/** Ce que les bols, une fois la physique chargée, mettent à la disposition des pierres. */
export interface Stage {
  /** Le couvercle de chaque joueur, où tombent ses prisonniers. */
  lids: Record<Color, Pile>;
}

export const StageContext = createContext<Stage | null>(null);

export function useStage(): Stage {
  const stage = useContext(StageContext);
  if (!stage) throw new Error('useStage : hors de la scène');
  return stage;
}
