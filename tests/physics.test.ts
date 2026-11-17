import { beforeAll, describe, expect, it } from 'vitest';
import { LID, BOWL, STONE_DIAMETER_BLACK, STONE_THICKNESS } from '../src/scene/dimensions.ts';
import { FRAME, Pile, loadPhysics, poseAt, type Rigid } from '../src/scene/physics.ts';
import { readMesh } from './glb.ts';

/** Les vrais maillages de la scène : c'est sur eux que les pierres tombent dans l'application. */
const GLB = 'public/modeles/shusaku_salon.glb';
const lid = readMesh(GLB, 'couvercle_noir', 'bol_bois');
const bowl = readMesh(GLB, 'bol_noir', 'bol_bois');
/** Le plus grand nombre de prisonniers d'une couleur dans une partie du corpus est bien inférieur. */
const PRISONERS = 40;
const HALF = STONE_THICKNESS / 2;

let rapier: Awaited<ReturnType<typeof loadPhysics>>;
beforeAll(async () => {
  rapier = await loadPhysics();
});

const lidPile = (): Pile =>
  new Pile(rapier, {
    fixed: [lid, bowl],
    centre: LID.B,
    spread: 2.6,
    rim: 2.2,
    diameter: STONE_DIAMETER_BLACK,
    seed: 11,
  });
const bowlPile = (): Pile =>
  new Pile(rapier, {
    fixed: [bowl],
    centre: BOWL.B,
    spread: 3.2,
    rim: 9,
    diameter: STONE_DIAMETER_BLACK,
    seed: 1,
  });
const distance = (r: Rigid, c: { x: number; z: number }): number =>
  Math.hypot(r.x - c.x, r.z - c.z);

describe('chute des prisonniers dans un couvercle', () => {
  it('chaque pierre finit dans le couvercle, au-dessus du sol, sans traverser les autres', () => {
    const pile = lidPile();
    const falls = Array.from({ length: PRISONERS }, (_, k) => pile.fall(k));
    for (const fall of falls) {
      expect(fall.rest.y).toBeGreaterThan(HALF * 0.5);
      expect(distance(fall.rest, LID.B)).toBeLessThan(6.3);
      // Elle est tombée : elle repose plus bas qu'elle n'a été lâchée, après un choc.
      expect(fall.rest.y).toBeLessThan(fall.start.y);
      expect(fall.impact).toBeGreaterThan(0);
      expect(fall.impact).toBeLessThan(fall.duration);
    }
    // Moins d'un demi-millimètre d'interpénétration entre deux pierres au repos.
    expect(pile.deepestOverlap()).toBeLessThan(0.05);
  });

  it('une première pierre repose à plat au fond du couvercle', () => {
    const { rest } = lidPile().fall(0);
    // Fond du couvercle à 0,8 cm.
    expect(rest.y - HALF).toBeGreaterThan(0.7);
    expect(rest.y - HALF).toBeLessThan(1.1);
    // Axe de la pierre proche de la verticale.
    const up = 1 - 2 * (rest.qx * rest.qx + rest.qz * rest.qz);
    expect(up).toBeGreaterThan(0.97);
  });

  it('est reproductible : deux simulations donnent les mêmes poses', () => {
    const a = lidPile();
    const b = lidPile();
    for (let k = 0; k < 12; k++) expect(a.rest(k)).toEqual(b.rest(k));
  });

  it('le rang seul décide : demander la 8ᵉ pierre d’emblée ou après les autres revient au même', () => {
    const direct = lidPile().rest(7);
    const stepwise = lidPile();
    for (let k = 0; k < 7; k++) stepwise.rest(k);
    expect(stepwise.rest(7)).toEqual(direct);
  });

  it('la chute enregistrée va du lâcher au repos, sans saut', () => {
    const fall = lidPile().fall(3);
    const pose = { ...fall.start };
    // Les poses sont enregistrées en simple précision.
    const first = poseAt(fall, 0, pose);
    expect(
      Math.hypot(first.x - fall.start.x, first.y - fall.start.y, first.z - fall.start.z),
    ).toBeLessThan(1e-4);
    const end = poseAt(fall, fall.duration + 1, { ...fall.start });
    expect(end.y).toBeCloseTo(fall.rest.y, 3);
    let previous = { ...fall.start };
    for (let t = FRAME; t <= fall.duration; t += FRAME) {
      const now = { ...poseAt(fall, t, pose) };
      // Chute libre de 2,6 cm : moins de 80 cm/s, soit 1,4 cm par pose.
      expect(Math.hypot(now.x - previous.x, now.y - previous.y, now.z - previous.z)).toBeLessThan(
        1.4,
      );
      expect(Math.hypot(now.qx, now.qy, now.qz, now.qw)).toBeCloseTo(1, 5);
      previous = now;
    }
  });
});

describe('pierres d’un bol', () => {
  it('22 pierres tiennent dans le bol et dépassent à peine son bord', () => {
    const pile = bowlPile();
    const rests = Array.from({ length: 22 }, (_, k) => pile.rest(k));
    for (const rest of rests) {
      // Fond de la cavité à 7,3 cm, ouverture de 5 cm de rayon.
      expect(rest.y - HALF).toBeGreaterThan(7.2);
      expect(distance(rest, BOWL.B)).toBeLessThan(5);
    }
    // Bord à 9 cm ; une pierre sur la tranche dépasse d'un centimètre au plus.
    expect(Math.max(...rests.map((r) => r.y + HALF))).toBeLessThan(10.5);
    expect(pile.deepestOverlap()).toBeLessThan(0.05);
  });
});
