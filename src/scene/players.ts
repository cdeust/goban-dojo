/**
 * Le geste des joueurs : prendre une pierre dans le bol, la porter, la poser, se retirer.
 *
 * La scène fournie contient l'animation d'un seul coup de Noir (K11). On en garde ce qui ne
 * dépend pas du point visé — le rythme, l'inclinaison du buste, la prise des doigts, l'orientation
 * de la main — et l'on recalcule le bras pour que le bout du majeur suive le trajet voulu jusqu'à
 * n'importe quelle intersection. Blanc reçoit le même geste, reporté sur son squelette (mêmes
 * noms d'os, disposition symétrique par rapport au centre du goban).
 *
 * Le calcul du bras est le portage de `solve_arm` et `frame` des scripts qui ont produit la scène
 * (rig/avatar.py, rig/gl.py), les clés du trajet celui de `KEYS` et `sample` (rig/build_scene2.py).
 */
import { animate } from 'motion';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { BOARD_TOP, BOWL, BOWL_HEIGHT, STONE_THICKNESS, pointToWorld } from './dimensions.ts';

type Side = 'noir' | 'blanc';
const SIDE: Record<Color, Side> = { B: 'noir', W: 'blanc' };

/** Instants (s) du geste d'origine. */
export const CLIP = {
  lift: 0.25,
  above: 1.05,
  contact: 1.2,
  hold: 1.7,
  back: 2.7,
  end: 3.2,
} as const;
/** Coup pour lequel l'animation d'origine a été construite : K11 (colonne 9, rangée 8). */
const REFERENCE_POINT = 8 * 19 + 9;
/** Hauteurs (cm) du trajet : sortie du bol, survol avant la frappe, flèche de l'arc. */
const LIFT = 5;
const HOVER = 7;
const ARC = 4.5;
/**
 * Pour atteindre un point éloigné, le joueur se penche depuis les hanches (jusqu'à PITCH_MAX),
 * puis, passé RISE_FROM de l'effort, se soulève sur les genoux (jusqu'à RISE_MAX).
 */
const PITCH_MAX = THREE.MathUtils.degToRad(72);
const RISE_MAX = THREE.MathUtils.degToRad(78);
const RISE_FROM = 0.3;
/** Le bras ne se tend jamais tout à fait : au-delà de cette part de sa longueur, on se penche. */
const COMFORT = 0.965;
/** Nombre de bissections pour trouver l'effort minimal. */
const SEARCH_STEPS = 9;

const ARM = ['rightUpperArm', 'rightLowerArm', 'rightHand'] as const;
const UP = new THREE.Vector3(0, 1, 0);

interface Track {
  bone: string;
  node: THREE.Object3D;
  sample: (t: number, out: THREE.Quaternion) => void;
  /** Rotation de l'os dans la pose de repos du joueur. */
  rest: THREE.Quaternion;
  /** Rotation du même os chez Noir à la fin du geste (sa pose de repos). */
  reference: THREE.Quaternion;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** Rotation qui amène `restDir` sur `dir`, et `restUp` au plus près de `up` (portage de `frame`). */
function frame(
  restDir: THREE.Vector3,
  restUp: THREE.Vector3,
  dir: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Quaternion {
  const basis = (a: THREE.Vector3, b: THREE.Vector3): THREE.Matrix4 => {
    const e1 = a.clone().normalize();
    let e2 = b.clone().addScaledVector(e1, -b.dot(e1));
    if (e2.lengthSq() < 1e-12)
      e2 = new THREE.Vector3().crossVectors(e1, new THREE.Vector3(1, 0, 0));
    e2.normalize();
    const e3 = new THREE.Vector3().crossVectors(e1, e2);
    return new THREE.Matrix4().makeBasis(e1, e2, e3);
  };
  const from = basis(restDir, restUp);
  const to = basis(dir, up);
  return new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}

class Player {
  readonly root: THREE.Object3D;
  private readonly bones = new Map<string, THREE.Object3D>();
  private readonly tracks: Track[] = [];
  private readonly hips: THREE.Object3D;
  private readonly hipsRest: THREE.Vector3;
  private readonly hipsSample: (t: number, out: THREE.Vector3) => void;
  private readonly hipsReference = new THREE.Vector3();
  private readonly hipsRatio: number;
  private readonly tip: THREE.Object3D;
  private readonly spineRest = new THREE.Quaternion();
  /** Du centre de la pierre au bout du majeur, au moment où le doigt la tient. */
  readonly tipOffset = new THREE.Vector3();
  /** Bout du doigt quand la main repose sur la cuisse. */
  readonly thigh = new THREE.Vector3();
  readonly bowl: THREE.Vector3;
  readonly referenceBoard: THREE.Vector3;
  private readonly facing = new THREE.Quaternion();

  readonly side: Side;
  /** 1 pour Noir, −1 pour Blanc : la disposition des deux joueurs est symétrique. */
  private readonly sign: 1 | -1;

  constructor(scene: THREE.Object3D, side: Side, clip: THREE.AnimationClip, sign: 1 | -1) {
    this.side = side;
    this.sign = sign;
    const find = (name: string): THREE.Object3D => {
      const node = scene.getObjectByName(name);
      if (!node) throw new Error(`os introuvable : ${name}`);
      return node;
    };
    this.root = find(side);
    this.root.traverse((o) => {
      if (o.name.startsWith(`${side}_`)) this.bones.set(o.name.slice(side.length + 1), o);
    });
    this.hips = this.bone('hips');
    this.hipsRest = this.hips.position.clone();
    this.tip = this.bone('J_Bip_R_Middle3_end');

    // Pistes de l'animation d'origine (toutes de Noir), échantillonnées à la demande.
    const origin = scene.getObjectByName('noir');
    let hipsSample: ((t: number, out: THREE.Vector3) => void) | null = null;
    for (const track of clip.tracks) {
      const [target, property] = track.name.split('.') as [string, string];
      if (!target.startsWith('noir_')) continue;
      const bone = target.slice(5);
      // Pistes à interpolation linéaire (sphérique pour les rotations), comme dans le fichier.
      const interpolant = track.InterpolantFactoryMethodLinear(undefined);
      if (property === 'position' && bone === 'hips') {
        hipsSample = (t, out) => void out.fromArray(interpolant.evaluate(t) as ArrayLike<number>);
        continue;
      }
      if (property !== 'quaternion') continue;
      const node = this.bones.get(bone);
      if (!node) continue;
      const sample = (t: number, out: THREE.Quaternion): void =>
        void out.fromArray(interpolant.evaluate(t) as ArrayLike<number>);
      const reference = new THREE.Quaternion();
      sample(CLIP.end, reference);
      this.tracks.push({ bone, node, sample, rest: node.quaternion.clone(), reference });
    }
    if (!hipsSample) throw new Error('piste du bassin absente');
    this.hipsSample = hipsSample;
    hipsSample(CLIP.end, this.hipsReference);
    // Les deux personnages n'ont pas la même taille : le déplacement du bassin est mis à l'échelle.
    const originSpine = origin?.getObjectByName('noir_spine');
    this.hipsRatio = originSpine
      ? this.bone('spine').position.length() / originSpine.position.length()
      : 1;
    if (side === 'noir') {
      // Noir : sa pose de repos est la fin de son propre geste.
      for (const t of this.tracks) t.rest.copy(t.reference);
      this.hipsRest.copy(this.hipsReference);
    }
    this.spineRest.copy(this.bone('spine').quaternion);

    this.bowl = new THREE.Vector3(sign * (BOWL.B.x - 1.5), BOWL_HEIGHT + 3, sign * (BOWL.B.z + 2));
    this.referenceBoard = new THREE.Vector3();
  }

  bone(name: string): THREE.Object3D {
    const node = this.bones.get(name);
    if (!node) throw new Error(`os introuvable : ${this.side}_${name}`);
    return node;
  }

  /** Centre d'une pierre posée sur l'intersection `point`. */
  static stoneAt(point: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, z] = pointToWorld(point);
    return out.set(x, BOARD_TOP + STONE_THICKNESS / 2, z);
  }

  /** Mesures faites une fois, sur la scène chargée. */
  calibrate(tipOffset: THREE.Vector3 | null): void {
    this.root.getWorldQuaternion(this.facing);
    if (tipOffset) this.tipOffset.copy(tipOffset);
    else {
      // Noir, à l'instant du contact de l'animation d'origine : le doigt est sur la pierre de K11.
      this.applyClip(1.45, 1.45, 0, true);
      this.root.updateWorldMatrix(true, true);
      this.tip
        .getWorldPosition(this.tipOffset)
        .sub(Player.stoneAt(REFERENCE_POINT, new THREE.Vector3()));
    }
    this.applyClip(CLIP.end, CLIP.end, 0, true);
    this.root.updateWorldMatrix(true, true);
    this.tip.getWorldPosition(this.thigh);
    // Point de référence du geste : K11 pour Noir, son symétrique pour Blanc.
    Player.stoneAt(
      this.sign === 1 ? REFERENCE_POINT : 360 - REFERENCE_POINT,
      this.referenceBoard,
    ).add(this.tipOffset);
  }

  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();

  /**
   * Applique l'animation d'origine, interpolée entre les instants `t0` et `t1` (part `u`).
   * Chez Blanc, c'est l'écart à la pose de repos de Noir qui est reporté sur sa propre pose.
   */
  private applyClip(t0: number, t1: number, u: number, withArm: boolean): void {
    for (const track of this.tracks) {
      if (!withArm && (ARM as readonly string[]).includes(track.bone)) continue;
      track.sample(t0, this.qa);
      if (u > 0) {
        track.sample(t1, this.qb);
        this.qa.slerp(this.qb, u);
      }
      if (this.side === 'noir') track.node.quaternion.copy(this.qa);
      else {
        // rest · (référence⁻¹ · pose) : même mouvement, à partir de sa propre pose de repos.
        this.qb.copy(track.reference).invert().multiply(this.qa);
        track.node.quaternion.copy(track.rest).multiply(this.qb);
      }
    }
    this.hipsSample(t0, this.va);
    if (u > 0) {
      this.hipsSample(t1, this.vb);
      this.va.lerp(this.vb, u);
    }
    this.hips.position
      .copy(this.hipsRest)
      .addScaledVector(this.va.sub(this.hipsReference), this.hipsRatio);
  }

  /**
   * Cinématique inverse à deux os (portage de `solve_arm`) : place le poignet en `wrist` et donne
   * à la main l'orientation `hand` (monde). Renvoie la distance qui manque (0 si le point est atteint)
   * et l'extension du bras (1 = bras tendu).
   */
  private solveArm(
    wrist: THREE.Vector3,
    hand: THREE.Quaternion,
  ): { miss: number; stretch: number } {
    const shoulder = this.bone('rightShoulder');
    const upper = this.bone('rightUpperArm');
    const lower = this.bone('rightLowerArm');
    const palm = this.bone('rightHand');
    shoulder.updateWorldMatrix(true, false);
    upper.updateWorldMatrix(false, false);
    const S = new THREE.Vector3().setFromMatrixPosition(upper.matrixWorld);
    const k = new THREE.Vector3().setFromMatrixColumn(upper.matrixWorld, 0).length();
    const du = lower.position;
    const df = palm.position;
    const a = k * du.length();
    const b = k * df.length();
    const v = wrist.clone().sub(S);
    const dist = v.length();
    const d = Math.min(dist, (a + b) * 0.999);
    const dn = v.clone().divideScalar(dist);
    // Le coude est tiré vers le bas et vers l'extérieur du corps (côté droit : signe −1).
    const pole = new THREE.Vector3(-0.9, 0, -0.25)
      .applyQuaternion(this.facing)
      .add(new THREE.Vector3(0, -1, 0))
      .normalize();
    const perp = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const E = S.clone()
      .addScaledVector(dn, a * cosA)
      .addScaledVector(perp, a * sinA);
    const W = S.clone().addScaledVector(dn, d);
    const hint = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.facing)
      .multiplyScalar(0.6)
      .add(UP);
    const Ru = frame(du, UP, E.clone().sub(S), hint);
    const Rf = frame(df, UP, W.clone().sub(E), hint);
    const parent = shoulder.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(parent.invert()).multiply(Ru);
    lower.quaternion.copy(Ru.clone().invert()).multiply(Rf);
    palm.quaternion.copy(Rf.clone().invert()).multiply(hand);
    return { miss: dist - d, stretch: dist / (a + b) };
  }

  /** Bout du doigt à l'instant `t` du geste vers `board` (portage de `sample`). */
  private path(t: number, board: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const keys: [number, THREE.Vector3][] = [
      [0, this.bowl],
      [
        CLIP.lift,
        this.va
          .copy(this.bowl)
          .setY(this.bowl.y + LIFT)
          .clone(),
      ],
      [
        CLIP.above,
        this.vb
          .copy(board)
          .setY(board.y + HOVER)
          .clone(),
      ],
      [CLIP.contact, board],
      [CLIP.hold, board],
      [CLIP.back, this.thigh],
      [CLIP.end, this.thigh],
    ];
    let i = 0;
    while (i < keys.length - 2 && (keys[i + 1] as [number, THREE.Vector3])[0] <= t) i++;
    const [t0, p0] = keys[i] as [number, THREE.Vector3];
    const [t1, p1] = keys[i + 1] as [number, THREE.Vector3];
    const u = THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
    // La frappe accélère jusqu'au contact ; le reste démarre et s'arrête en douceur.
    const e = t0 === CLIP.above ? u * u : smooth(u);
    out.lerpVectors(p0, p1, e);
    // Le transport et le retour décrivent un arc.
    if (t0 === CLIP.lift || t0 === CLIP.hold) out.y += ARC * Math.sin(Math.PI * e);
    return out;
  }

  private readonly h = new THREE.Quaternion();
  private readonly o = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly pref = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  /**
   * Pose le joueur à l'instant `t` du geste vers le point `board` (bout du doigt visé).
   * `fromRest` (0 à 1) : phase d'approche, de la cuisse au bol, avant le début du geste.
   * Renvoie la position du bout du doigt et l'écart au point visé.
   */
  pose(t: number, board: THREE.Vector3, fromRest = 1): { tip: THREE.Vector3; miss: number } {
    const approach = fromRest < 1;
    const e = smooth(THREE.MathUtils.clamp(fromRest, 0, 1));
    // Trajet voulu et trajet de référence (celui de l'animation d'origine).
    if (approach) {
      this.p.lerpVectors(this.thigh, this.bowl, e);
      this.p.y += ARC * Math.sin(Math.PI * e);
      this.pref.copy(this.p);
    } else {
      this.path(t, board, this.p);
      this.path(t, this.referenceBoard, this.pref);
    }
    return this.solve(() =>
      approach ? this.applyClip(CLIP.end, 0, e, true) : this.applyClip(t, t, 0, true),
    );
  }

  /**
   * Amène le bout du doigt en `point`, la main fermée à `grip` (1 = prise de la pierre, 0 = main
   * détendue). Sert aux gestes libres : ramasser un prisonnier, le déposer dans le couvercle.
   */
  reach(point: THREE.Vector3, grip: number): { tip: THREE.Vector3; miss: number } {
    this.p.copy(point);
    this.pref.copy(this.referenceBoard);
    // De la pose « doigt sur la pierre » à la pose de repos : les doigts s'ouvrent.
    return this.solve(() =>
      this.applyClip(CLIP.hold, CLIP.end, 1 - THREE.MathUtils.clamp(grip, 0, 1), true),
    );
  }

  /**
   * Résout la pose : `base` applique buste, jambes, doigts et bras d'origine ; le bras est ensuite
   * recalculé pour que le bout du doigt soit en `this.p`, la main tournée comme vers `this.pref`.
   */
  private solve(base: () => void): { tip: THREE.Vector3; miss: number } {
    /** Pose complète pour un effort donné (0 = pose d'origine, 1 = penché et soulevé au maximum). */
    const attempt = (effort: number): { miss: number; stretch: number } => {
      base();
      if (effort > 0) this.lean(effort);
      this.root.updateWorldMatrix(true, true);

      // Orientation de la main : celle d'origine, tournée vers le point réellement visé.
      const palm = this.bone('rightHand');
      this.bone('rightUpperArm').getWorldPosition(this.s);
      palm.getWorldQuaternion(this.h);
      const heading = (v: THREE.Vector3): number => Math.atan2(v.x - this.s.x, v.z - this.s.z);
      this.turn.setFromAxisAngle(UP, heading(this.p) - heading(this.pref));
      this.h.premultiply(this.turn);
      // Du poignet au bout du doigt, dans cette orientation.
      this.tip
        .getWorldPosition(this.o)
        .sub(palm.getWorldPosition(this.va))
        .applyQuaternion(this.turn);

      // Bras : le poignet là où il faut pour que le bout du doigt soit au point voulu.
      return this.solveArm(this.va.copy(this.p).sub(this.o), this.h);
    };

    // La pose d'origine suffit si elle atteint le point ; sinon on cherche le plus petit effort
    // qui l'atteint sans tendre le bras à fond.
    let result = attempt(0);
    if (result.miss > 1e-6) {
      let low = 0;
      let high = 1;
      for (let i = 0; i < SEARCH_STEPS; i++) {
        const mid = (low + high) / 2;
        if (attempt(mid).stretch <= COMFORT) high = mid;
        else low = mid;
      }
      result = attempt(high);
    }
    this.root.updateWorldMatrix(true, true);
    return { tip: this.tip.getWorldPosition(new THREE.Vector3()), miss: result.miss };
  }

  /** Position actuelle du bout du doigt. */
  tipNow(): THREE.Vector3 {
    this.root.updateWorldMatrix(true, true);
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  /**
   * Se pencher, puis se soulever. Le bassin pivote vers l'avant ; au-delà de RISE_FROM, les cuisses
   * se redressent autour des genoux, qui restent au sol avec les jambes. Les rotations sont
   * calculées dans le monde, puis ramenées dans le repère de chaque os.
   */
  private lean(effort: number): void {
    const pitch = Math.min(1, effort / RISE_FROM) * PITCH_MAX * 0.45 + effort * PITCH_MAX * 0.55;
    const rise = Math.max(0, (effort - RISE_FROM) / (1 - RISE_FROM)) * RISE_MAX;
    this.root.updateWorldMatrix(true, true);
    const hips = this.hips;
    const legs = (['left', 'right'] as const).map((sideName) => {
      const upper = this.bone(`${sideName}UpperLeg`);
      const lower = this.bone(`${sideName}LowerLeg`);
      return {
        upper,
        lower,
        upperWorld: upper.getWorldQuaternion(new THREE.Quaternion()),
        lowerWorld: lower.getWorldQuaternion(new THREE.Quaternion()),
        knee: lower.getWorldPosition(new THREE.Vector3()),
      };
    });
    // Axe transversal du joueur, dans le monde : se pencher en avant, c'est tourner autour de lui.
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.facing);
    const risen = new THREE.Quaternion().setFromAxisAngle(axis, rise);
    const pitched = new THREE.Quaternion().setFromAxisAngle(axis, pitch);

    // Le bassin tourne autour de la ligne des genoux, puis bascule vers l'avant.
    const knees = (legs[0] as (typeof legs)[number]).knee
      .clone()
      .add((legs[1] as (typeof legs)[number]).knee)
      .multiplyScalar(0.5);
    const position = hips
      .getWorldPosition(new THREE.Vector3())
      .sub(knees)
      .applyQuaternion(risen)
      .add(knees);
    const parent = hips.parent;
    if (!parent) return;
    hips.position.copy(parent.worldToLocal(position));
    const hipsWorld = hips.getWorldQuaternion(new THREE.Quaternion()).premultiply(pitched);
    hips.quaternion
      .copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(hipsWorld);

    for (const leg of legs) {
      // La cuisse se redresse ; la jambe, elle, ne quitte pas le sol.
      const upperWorld = leg.upperWorld.clone().premultiply(risen);
      leg.upper.quaternion.copy(hipsWorld.clone().invert()).multiply(upperWorld);
      leg.lower.quaternion.copy(upperWorld.invert()).multiply(leg.lowerWorld);
    }
    // La tête se relève d'une partie de l'inclinaison, pour garder le regard sur le goban.
    this.bone('neck').quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch * 0.35),
    );
  }

  /**
   * Contrôle du portage : écart angulaire maximal (rad) entre le bras recalculé et le bras de
   * l'animation d'origine, à l'instant `t` du geste de référence. N'a de sens que pour Noir.
   */
  baselineError(t: number): number {
    this.pose(t, this.referenceBoard);
    let worst = 0;
    for (const track of this.tracks) {
      if (!(ARM as readonly string[]).includes(track.bone)) continue;
      track.sample(t, this.qa);
      worst = Math.max(worst, track.node.quaternion.angleTo(this.qa));
    }
    return worst;
  }

  /** Retour immédiat à la pose de repos. */
  rest(): void {
    this.applyClip(CLIP.end, CLIP.end, 0, true);
    this.root.updateWorldMatrix(true, true);
  }
}

export interface GestureOptions {
  /** Durée (s) entre le début du geste et le contact de la pierre. */
  duration: number;
  /** Appelé à chaque image tant que la pierre est tenue, avec la position de son centre. */
  onStone: (x: number, y: number, z: number) => void;
  /** Appelé à l'instant où la pierre touche le goban. */
  onContact: () => void;
  /** Appelé à chaque image du geste (demande de rendu). */
  onFrame: () => void;
}

type Running = { stop: () => void };

/** Une pierre capturée à ramasser sur le goban et à déposer dans un couvercle. */
export interface Prisoner {
  /** Centre de la pierre sur le goban, puis à l'endroit où elle est lâchée au-dessus du couvercle. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Appelé à chaque image tant que la pierre est tenue. */
  onMove: (x: number, y: number, z: number) => void;
  /**
   * Appelé quand la pierre est lâchée ; `played` est faux si le geste a été interrompu. `order`
   * est son rang dans la poignée (0 pour une pierre portée seule).
   */
  onDrop: (played: boolean, order: number) => void;
}

/** Les deux joueurs de la scène, prêts à jouer n'importe quel coup. */
export class Players {
  private readonly players: Record<Side, Player>;
  private readonly running: Partial<Record<Side, Running[]>> = {};

  constructor(scene: THREE.Object3D, clip: THREE.AnimationClip) {
    const noir = new Player(scene, 'noir', clip, 1);
    const blanc = new Player(scene, 'blanc', clip, -1);
    scene.updateWorldMatrix(true, true);
    noir.calibrate(null);
    blanc.calibrate(noir.tipOffset);
    noir.rest();
    blanc.rest();
    this.players = { noir, blanc };
  }

  /** Part minimale du temps avant contact consacrée à aller de la cuisse au bol. */
  private static readonly APPROACH = 0.3;

  /** Fait jouer le coup `point` par le joueur de couleur `color`. */
  play(color: Color, point: number, options: GestureOptions): Running {
    const side = SIDE[color];
    const player = this.players[side];
    this.stop(side);
    const target = Player.stoneAt(point, new THREE.Vector3()).add(player.tipOffset);
    const chain: Running[] = [];
    this.running[side] = chain;
    const active = (): boolean => this.running[side] === chain;
    const carry = (): void => {
      if (!active()) return;
      chain.push(
        animate(0, CLIP.contact, {
          duration: options.duration * (1 - Players.APPROACH),
          ease: 'linear',
          onUpdate: (t) => {
            const { tip } = player.pose(t, target);
            options.onStone(
              tip.x - player.tipOffset.x,
              tip.y - player.tipOffset.y,
              tip.z - player.tipOffset.z,
            );
            options.onFrame();
          },
          onComplete: () => {
            if (!active()) return;
            options.onContact();
            // Le doigt reste un instant sur la pierre, puis la main revient sur la cuisse.
            const scale = Math.min(1, options.duration / CLIP.contact);
            chain.push(
              animate(CLIP.contact, CLIP.end, {
                duration: (CLIP.end - CLIP.contact) * Math.max(0.45, scale),
                ease: 'linear',
                onUpdate: (t) => {
                  player.pose(t, target);
                  options.onFrame();
                },
              }),
            );
          },
        }),
      );
    };
    chain.push(
      animate(0, 1, {
        duration: options.duration * Players.APPROACH,
        ease: 'linear',
        onUpdate: (u) => {
          player.pose(0, target, u);
          options.onFrame();
        },
        onComplete: carry,
      }),
    );
    return { stop: () => this.stop(side) };
  }

  /**
   * Fait ramasser des pierres capturées par le joueur de couleur `color` : la main va sur chaque
   * pierre, la pince, la soulève et la dépose dans son couvercle. Au-delà de `SINGLE_TRIPS`
   * pierres, les dernières sont emportées ensemble, en une poignée.
   */
  collect(color: Color, items: Prisoner[], onFrame: () => void): Running {
    const side = SIDE[color];
    const player = this.players[side];
    this.stop(side);
    const chain: Running[] = [];
    this.running[side] = chain;
    const active = (): boolean => this.running[side] === chain;
    const dropped = new Set<Prisoner>();
    const drop = (item: Prisoner, played: boolean, order: number): void => {
      if (dropped.has(item)) return;
      dropped.add(item);
      item.onDrop(played, order);
    };
    const trips: Prisoner[][] = items.slice(0, Players.SINGLE_TRIPS - 1).map((item) => [item]);
    if (items.length >= Players.SINGLE_TRIPS) trips.push(items.slice(Players.SINGLE_TRIPS - 1));

    /** Déplace le bout du doigt de `from` à `to`, en arc, la main fermée de `g0` à `g1`. */
    const move = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      seconds: number,
      grips: [number, number],
      carried: Prisoner[],
      then: () => void,
    ): void => {
      if (!active()) return;
      const here = new THREE.Vector3();
      const starts = carried.map((c) => c.from.clone());
      chain.push(
        animate(0, 1, {
          duration: seconds,
          ease: 'linear',
          onUpdate: (u) => {
            const e = smooth(u);
            here.lerpVectors(from, to, e);
            here.y += ARC * 0.7 * Math.sin(Math.PI * e);
            player.reach(here, grips[0] + (grips[1] - grips[0]) * e);
            // Les pierres tenues suivent la main, chacune vers sa place dans le couvercle.
            carried.forEach((c, k) => {
              const p = here.clone().lerpVectors(starts[k] as THREE.Vector3, c.to, e);
              p.y += ARC * 0.7 * Math.sin(Math.PI * e);
              c.onMove(p.x, p.y, p.z);
            });
            onFrame();
          },
          onComplete: then,
        }),
      );
    };

    const tipOn = (stone: THREE.Vector3): THREE.Vector3 => stone.clone().add(player.tipOffset);
    const next = (index: number, from: THREE.Vector3): void => {
      const trip = trips[index];
      if (!trip) {
        // Plus rien à prendre : la main revient sur la cuisse, détendue.
        move(from, player.thigh, 0.55, [0.4, 0], [], () => undefined);
        return;
      }
      const first = trip[0] as Prisoner;
      const grab = tipOn(first.from);
      const release = tipOn(first.to);
      move(from, grab, 0.3, [0.6, 1], [], () => {
        // La pierre est pincée, soulevée, portée au-dessus du couvercle, puis lâchée.
        move(grab, release, 0.42, [1, 1], trip, () => {
          trip.forEach((item, order) => drop(item, true, order));
          next(index + 1, release);
        });
      });
    };
    next(0, player.tipNow());
    return {
      stop: () => {
        if (active()) this.stop(side);
        // Un geste interrompu ne laisse aucune pierre en l'air.
        for (const item of items) drop(item, false, 0);
      },
    };
  }

  /** Nombre de pierres au-delà duquel le reste est ramassé en une poignée. */
  private static readonly SINGLE_TRIPS = 3;

  private stop(side: Side): void {
    for (const r of this.running[side] ?? []) r.stop();
    delete this.running[side];
  }

  /** Interrompt tout geste et remet les deux joueurs au repos. */
  reset(): void {
    this.stop('noir');
    this.stop('blanc');
    this.players.noir.rest();
    this.players.blanc.rest();
  }

  /** Contrôle : écart angulaire maximal (rad) au geste d'origine, sur toute sa durée. */
  baselineError(): number {
    let worst = 0;
    for (let t = 0; t <= CLIP.end; t += 0.05)
      worst = Math.max(worst, this.players.noir.baselineError(t));
    this.players.noir.rest();
    return worst;
  }

  /**
   * Contrôle : écart (cm) entre le bout du doigt et le point visé, au contact, pour une
   * intersection donnée. Laisse le joueur au repos.
   */
  missAt(color: Color, point: number): number {
    const player = this.players[SIDE[color]];
    const target = Player.stoneAt(point, new THREE.Vector3()).add(player.tipOffset);
    const { tip, miss } = player.pose(CLIP.contact, target);
    const gap = Math.max(miss, tip.distanceTo(target));
    player.rest();
    return gap;
  }
}
