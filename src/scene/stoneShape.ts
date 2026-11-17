import { STONE_THICKNESS } from './dimensions.ts';

/**
 * Profil d'une pierre biconvexe de diamètre 1 : demi-coupe (rayon, hauteur) du bas vers le haut,
 * la pierre posée sur y = 0. Le bord est adouci, comme le demande la source des cotes
 * (« the rim should have a soft edge »). C'est la seule définition de la forme : le maillage
 * affiché et le solide de la simulation en sont tous deux tirés.
 *
 * @param diameter diamètre réel (cm), dont dépend l'épaisseur relative.
 */
export function stoneProfile(diameter: number, segments = 18): [number, number][] {
  const h = STONE_THICKNESS / diameter;
  const profile: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -Math.PI / 2 + (i / segments) * Math.PI;
    const r = i === 0 || i === segments ? 0 : 0.5 * Math.pow(Math.cos(a), 0.72);
    profile.push([r, (h / 2) * Math.sin(a) + h / 2]);
  }
  return profile;
}
