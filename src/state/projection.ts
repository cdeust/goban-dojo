/**
 * Passerelle entre la scène 3D et l'interface : la scène y dépose une fonction qui donne la
 * position à l'écran d'une intersection du goban, l'interface s'en sert pour y dessiner.
 * (Les deux couches ne s'importent pas l'une l'autre.)
 */
export interface ScreenPoint {
  /** Pixels CSS, relatifs à la fenêtre. */
  x: number;
  y: number;
  /** Taille apparente (px) d'une pierre à cet endroit. */
  size: number;
}

type Projector = (point: number) => ScreenPoint | null;

let projector: Projector | null = null;

export function setProjector(next: Projector | null): void {
  projector = next;
}

export function projectPoint(point: number): ScreenPoint | null {
  return projector ? projector(point) : null;
}
