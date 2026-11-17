import { beforeAll, describe, expect, it } from 'vitest';
import { BOWL_FILL, LID_FILL } from '../src/scene/Bowls.tsx';
import { BOWL, LID, STONE_DIAMETER_BLACK, STONE_THICKNESS } from '../src/scene/dimensions.ts';
import { bowlGeometry, lidGeometry, triMeshOf } from '../src/scene/geometry.ts';
import { FRAME, Pile, loadPhysics, poseAt, type Rigid } from '../src/scene/physics.ts';

/** Les obstacles et les réglages de l'application : c'est sur eux que les pierres y tombent. */
const lid = triMeshOf(lidGeometry(), LID.B);
const bowl = triMeshOf(bowlGeometry(), BOWL.B);
/** Bien plus que le plus grand nombre de prisonniers d'une couleur dans une partie du corpus. */
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
    ...LID_FILL,
    diameter: STONE_DIAMETER_BLACK,
    seed: 11,
  });
const bowlPile = (): Pile =>
  new Pile(rapier, {
    fixed: [bowl],
    centre: BOWL.B,
    ...BOWL_FILL,
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
      expect(distance(fall.rest, LID.B)).toBeLessThan(6.35);
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
    // Fond du couvercle à 0,6 cm.
    expect(rest.y - HALF).toBeGreaterThan(0.5);
    expect(rest.y - HALF).toBeLessThan(0.9);
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
  it('les pierres visibles tiennent dans le bol et affleurent son bord', () => {
    const pile = bowlPile();
    const rests = Array.from({ length: BOWL_FILL.stones }, (_, k) => pile.rest(k));
    for (const rest of rests) {
      expect(rest.y - HALF).toBeGreaterThan(BOWL_FILL.floor - 0.1);
      // Paroi intérieure à 6,5 cm au plus large.
      expect(distance(rest, BOWL.B)).toBeLessThan(6.5);
    }
    const top = Math.max(...rests.map((r) => r.y + HALF));
    // Bord à 9 cm : le tas l'atteint presque, et le dépasse d'un centimètre au plus.
    expect(top).toBeGreaterThan(8);
    expect(top).toBeLessThan(10);
    expect(pile.deepestOverlap()).toBeLessThan(0.05);
  });
});
