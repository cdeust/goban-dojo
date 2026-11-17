/**
 * Physique des pierres hors du goban (Rapier) : la chute d'une pierre lâchée dans un bol ou un
 * couvercle, ses rebonds, et l'endroit où elle s'immobilise.
 *
 * Une relecture doit pouvoir sauter à n'importe quel coup et montrer le même couvercle que si
 * l'on y était arrivé coup par coup. Les pierres sont donc simulées une à une, dans l'ordre :
 * la pierre de rang k tombe sur les k − 1 précédentes, figées là où elles se sont arrêtées. Sa
 * chute ne dépend alors que de son rang, et le résultat se calcule une fois pour toutes.
 * Contrepartie assumée : une pierre qui tombe ne déplace pas celles qui reposent déjà.
 *
 * Unités : centimètres et secondes, comme la scène.
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import { STONE_THICKNESS } from './dimensions.ts';
import { mulberry32 } from './random.ts';
import { stoneProfile } from './stoneShape.ts';

type Rapier = typeof RAPIER;

/** Position du centre d'un solide et son orientation (quaternion). */
export interface Rigid {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/** Maillage triangulé d'un objet fixe, en coordonnées de la scène. */
export interface TriMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

/** La chute d'une pierre, du lâcher à l'immobilité. */
export interface Fall {
  /** Poses successives, 7 nombres chacune (x, y, z, qx, qy, qz, qw), toutes les `FRAME` secondes. */
  frames: Float32Array;
  /** Durée (s) de la chute. */
  duration: number;
  /** Instant (s) du premier choc. */
  impact: number;
  start: Rigid;
  rest: Rigid;
}

/** Pas d'intégration (s). Les pierres sont petites et les parois minces : il doit rester fin. */
const STEP = 1 / 240;
/** Une pose enregistrée tous les `SAMPLE` pas. */
const SAMPLE = 4;
export const FRAME = STEP * SAMPLE;
/** Au-delà, la pierre est figée où elle se trouve. */
const MAX_STEPS = 720;
/** Une pierre est au repos quand elle est restée sous ces vitesses pendant `STILL_STEPS` pas. */
const STILL_SPEED = 0.6; // cm/s
const STILL_SPIN = 0.5; // rad/s
const STILL_STEPS = 24;
/**
 * Échelle des tolérances du solveur. Mesuré sur 60 pierres dans un couvercle : interpénétration
 * maximale de 0,6 mm à 10, 0,26 mm à 3, 0,2 mm à 1 (où davantage de pierres ne s'immobilisent pas).
 */
const LENGTH_UNIT = 3;
/** Hauteur (cm) du lâcher au-dessus du tas. */
const DROP = 2.6;

/** Ardoise ou coquillage sur bois verni : choix raisonnés, non mesurés. */
const FRICTION = 0.45;
const RESTITUTION = 0.22;
/** Masse volumique (g/cm³) : sans effet sur une chute libre, mais Rapier en demande une. */
const DENSITY = 2.7;

let engine: Promise<Rapier> | null = null;

/** Charge le moteur (WebAssembly) à la première demande. */
export function loadPhysics(): Promise<Rapier> {
  engine ??= import('@dimforge/rapier3d-compat').then(async ({ default: rapier }) => {
    await rapier.init();
    return rapier;
  });
  return engine;
}

/** Sommets de l'enveloppe convexe d'une pierre, centrée sur son centre de gravité. */
function stoneHull(diameter: number): Float32Array {
  const RING = 14;
  const points: number[] = [];
  for (const [r, y] of stoneProfile(diameter, 10)) {
    for (let k = 0; k < (r === 0 ? 1 : RING); k++) {
      const a = (k / RING) * Math.PI * 2;
      points.push(
        r * diameter * Math.cos(a),
        y * diameter - STONE_THICKNESS / 2,
        r * diameter * Math.sin(a),
      );
    }
  }
  return new Float32Array(points);
}

export interface PileOptions {
  /** Objets fixes sur lesquels les pierres tombent (bol, couvercle…). Le sol y = 0 est ajouté. */
  fixed: TriMesh[];
  /** Fond caché : un disque plein à cette hauteur (cm), sous les pierres visibles d'un bol profond. */
  floor?: number;
  /** Centre du lâcher, et rayon dans lequel il varie d'une pierre à l'autre. */
  centre: { x: number; z: number };
  spread: number;
  /** Hauteur (cm) du bord : les pierres sont lâchées au-dessus. */
  rim: number;
  /** Diamètre (cm) des pierres. */
  diameter: number;
  /** Graine des variations d'une pierre à l'autre. */
  seed: number;
}

/** Un tas de pierres lâchées une à une au même endroit. */
export class Pile {
  private readonly rapier: Rapier;
  private readonly world: RAPIER.World;
  private readonly hull: Float32Array;
  private readonly options: PileOptions;
  private readonly falls: Fall[] = [];
  private readonly stones: RAPIER.Collider[] = [];
  /** Sommet du tas (cm). */
  private top: number;

  constructor(rapier: Rapier, options: PileOptions) {
    this.rapier = rapier;
    this.options = options;
    this.top = options.rim;
    this.hull = stoneHull(options.diameter);
    const world = new rapier.World({ x: 0, y: -981, z: 0 });
    world.timestep = STEP;
    // Tolérances du solveur rapportées à la taille des pierres plutôt qu'au mètre.
    world.lengthUnit = LENGTH_UNIT;
    const fix = (shape: RAPIER.ColliderDesc): void => {
      world.createCollider(shape.setFriction(FRICTION).setRestitution(RESTITUTION));
    };
    fix(rapier.ColliderDesc.cuboid(500, 5, 500).setTranslation(0, -5, 0));
    for (const mesh of options.fixed) fix(rapier.ColliderDesc.trimesh(mesh.vertices, mesh.indices));
    if (options.floor !== undefined) {
      fix(
        rapier.ColliderDesc.cylinder(0.5, 20).setTranslation(
          options.centre.x,
          options.floor - 0.5,
          options.centre.z,
        ),
      );
    }
    this.world = world;
  }

  /** Pose de repos de la pierre de rang `k` (0 = la première lâchée). */
  rest(k: number): Rigid {
    return this.fall(k).rest;
  }

  /** Chute de la pierre de rang `k`. Simule au besoin toutes celles qui la précèdent. */
  fall(k: number): Fall {
    while (this.falls.length <= k) this.falls.push(this.simulate(this.falls.length));
    return this.falls[k] as Fall;
  }

  /** Plus grande interpénétration (cm) entre deux pierres au repos. Sert aux contrôles. */
  deepestOverlap(): number {
    let deepest = 0;
    for (let i = 0; i < this.stones.length; i++) {
      for (let j = i + 1; j < this.stones.length; j++) {
        const contact = (this.stones[i] as RAPIER.Collider).contactCollider(
          this.stones[j] as RAPIER.Collider,
          0,
        );
        if (contact) deepest = Math.max(deepest, -contact.distance);
      }
    }
    return deepest;
  }

  /** Crée la pierre de rang `k`, lâchée au-dessus du tas, un peu inclinée, comme elle quitte les doigts. */
  private spawn(k: number): RAPIER.RigidBody {
    const { rapier, world, options } = this;
    const rnd = mulberry32(options.seed + Math.imul(k + 1, 2654435761));
    const r = options.spread * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const q = [(rnd() - 0.5) * 0.45, rnd() * 2 - 1, (rnd() - 0.5) * 0.45, 1];
    const norm = Math.hypot(...q);
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(
          options.centre.x + r * Math.cos(a),
          this.top + DROP,
          options.centre.z + r * Math.sin(a),
        )
        .setRotation({
          x: (q[0] as number) / norm,
          y: (q[1] as number) / norm,
          z: (q[2] as number) / norm,
          w: (q[3] as number) / norm,
        })
        .setAngularDamping(1.5)
        .setCcdEnabled(true),
    );
    const hull = rapier.ColliderDesc.convexHull(this.hull);
    if (!hull) throw new Error('enveloppe convexe de la pierre impossible à construire');
    this.stones.push(
      world.createCollider(
        hull.setFriction(FRICTION).setRestitution(RESTITUTION).setDensity(DENSITY),
        body,
      ),
    );
    return body;
  }

  private simulate(k: number): Fall {
    const body = this.spawn(k);
    const start = poseOf(body);
    const frames: number[] = [];
    const record = (p: Rigid): void => {
      frames.push(p.x, p.y, p.z, p.qx, p.qy, p.qz, p.qw);
    };
    record(start);
    let impact = 0;
    let fallSpeed = 0;
    let last = 0;
    let still = 0;
    for (let step = 1; step <= MAX_STEPS && still < STILL_STEPS; step++) {
      this.world.step();
      const v = body.linvel();
      const w = body.angvel();
      // Premier choc : la vitesse de chute cesse d'augmenter.
      if (impact === 0 && v.y > fallSpeed + 1) impact = step * STEP;
      fallSpeed = Math.min(fallSpeed, v.y);
      const quiet =
        Math.hypot(v.x, v.y, v.z) < STILL_SPEED && Math.hypot(w.x, w.y, w.z) < STILL_SPIN;
      still = quiet ? still + 1 : 0;
      last = step;
      if (step % SAMPLE === 0) record(poseOf(body));
    }
    // La pierre ne bougera plus : elle devient un obstacle pour les suivantes.
    body.setBodyType(this.rapier.RigidBodyType.Fixed, false);
    const rest = poseOf(body);
    this.top = Math.max(this.top, rest.y + STONE_THICKNESS / 2);
    if (last % SAMPLE !== 0) record(rest);
    return {
      frames: new Float32Array(frames),
      duration: (frames.length / 7 - 1) * FRAME,
      impact,
      start,
      rest,
    };
  }
}

function poseOf(body: RAPIER.RigidBody): Rigid {
  const t = body.translation();
  const q = body.rotation();
  return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}

/** Pose à l'instant `t` (s) d'une chute, écrite dans `out`. */
export function poseAt(fall: Fall, t: number, out: Rigid): Rigid {
  const last = fall.frames.length / 7 - 1;
  const f = Math.min(Math.max(t / FRAME, 0), last);
  const i = Math.min(Math.floor(f), last - 1 < 0 ? 0 : last - 1);
  const u = f - i;
  const a = i * 7;
  const b = Math.min(i + 1, last) * 7;
  const at = (o: number): number =>
    (fall.frames[a + o] as number) * (1 - u) + (fall.frames[b + o] as number) * u;
  // Entre deux poses voisines, une interpolation linéaire renormalisée du quaternion suffit.
  const sign =
    (fall.frames[a + 3] as number) * (fall.frames[b + 3] as number) +
      (fall.frames[a + 4] as number) * (fall.frames[b + 4] as number) +
      (fall.frames[a + 5] as number) * (fall.frames[b + 5] as number) +
      (fall.frames[a + 6] as number) * (fall.frames[b + 6] as number) <
    0
      ? -1
      : 1;
  const q = (o: number): number =>
    (fall.frames[a + o] as number) * (1 - u) + sign * (fall.frames[b + o] as number) * u;
  const n = Math.hypot(q(3), q(4), q(5), q(6)) || 1;
  out.x = at(0);
  out.y = at(1);
  out.z = at(2);
  out.qx = q(3) / n;
  out.qy = q(4) / n;
  out.qz = q(5) / n;
  out.qw = q(6) / n;
  return out;
}
