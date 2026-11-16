/**
 * Dimensions du matériel, en centimètres (1 unité de scène = 1 cm).
 *
 * Source : Sensei's Library, « Equipment Dimensions »
 * (https://senseis.xmp.net/?EquipmentDimensions), valeurs du goban japonais :
 * plateau 424,2 × 454,5 × 151,5 mm ; lignes espacées de 22 mm en largeur et
 * 23,7 mm en longueur, épaisses de 1 mm ; hoshi de 4 mm ; pierres de 22,1 mm
 * (blanches) à un peu plus (noires), épaisses de 6 à 10 mm, biconvexes.
 */
export const BOARD_WIDTH = 42.42;
export const BOARD_LENGTH = 45.45;
export const BOARD_THICKNESS = 15.15;
export const PITCH_X = 2.2;
export const PITCH_Z = 2.37;
export const LINE_WIDTH = 0.1;
export const HOSHI_DIAMETER = 0.4;

/** Hauteur des pieds d'un goban de sol. Choix de mise en scène (≈ 4 sun), non normé par la source. */
export const LEG_HEIGHT = 12.1;
export const BOARD_TOP = LEG_HEIGHT + BOARD_THICKNESS;

/**
 * Diamètre des pierres. La source donne 22,1 mm (blanc) et un peu plus (noir), soit plus
 * que l'entraxe de 22 mm : sur un vrai goban les pierres se poussent hors de l'alignement.
 * Faute de simuler ces contacts, on réduit le diamètre de 2 % pour qu'elles ne s'interpénètrent pas.
 */
export const STONE_DIAMETER_BLACK = 2.18;
export const STONE_DIAMETER_WHITE = 2.15;
/** Épaisseur : 8,8 mm, dans la fourchette 6–10 mm de la source. */
export const STONE_THICKNESS = 0.88;

export const GRID_SIZE = 19;

/** Position (x, z) du centre d'une intersection ; le point 0 (« aa ») est au fond à gauche. */
export function pointToWorld(p: number): [number, number] {
  const x = p % GRID_SIZE;
  const y = Math.floor(p / GRID_SIZE);
  return [(x - 9) * PITCH_X, (y - 9) * PITCH_Z];
}

/**
 * Disposition des bols (goke) et de leurs couvercles, posés sur le tatami à la droite
 * de chaque joueur. Noir est assis en +z, Blanc en −z.
 */
export const BOWL = {
  B: { x: 32, z: 12 },
  W: { x: -32, z: -12 },
} as const;
export const LID = {
  B: { x: 32, z: 29 },
  W: { x: -32, z: -29 },
} as const;
export const BOWL_HEIGHT = 9;
/** Hauteur du fond du couvercle retourné, où reposent les prisonniers. */
export const LID_FLOOR = 0.6;
