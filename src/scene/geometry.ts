import * as THREE from 'three';
import { LEG_HEIGHT, STONE_THICKNESS } from './dimensions.ts';

/**
 * Pierre biconvexe, de diamètre 1 (mise à l'échelle par instance), posée sur y = 0.
 * Le profil est une lentille dont le bord est adouci, comme le demande la source
 * (« the rim should have a soft edge »).
 */
export function stoneGeometry(diameter: number): THREE.BufferGeometry {
  const r = 0.5;
  const h = STONE_THICKNESS / diameter;
  const pts: THREE.Vector2[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    pts.push(new THREE.Vector2(r * Math.pow(Math.cos(a), 0.72), (h / 2) * Math.sin(a) + h / 2));
  }
  (pts[0] as THREE.Vector2).x = 0;
  (pts[N] as THREE.Vector2).x = 0;
  const g = new THREE.LatheGeometry(pts, 40);
  // UV planaires vues de dessus : les stries de la coquille traversent la pierre en ligne droite.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getZ(i) + 0.5);
  g.computeVertexNormals();
  return g;
}

function lathe(points: [number, number][], segments: number, smooth = 48): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const pts = curve.getPoints(smooth);
  (pts[0] as THREE.Vector2).x = 0;
  return new THREE.LatheGeometry(pts, segments);
}

/** Bol à pierres (goke) : panse renflée, ouverture resserrée ; paroi extérieure puis intérieure. */
export function bowlGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0, 0],
      [4.3, 0],
      [5.6, 0.5],
      [6.8, 2.6],
      [7.15, 4.7],
      [6.8, 6.9],
      [6.0, 8.5],
      [5.7, 9.0],
      [5.35, 9.0],
      [5.45, 8.4],
      [6.2, 6.9],
      [6.5, 4.7],
      [6.2, 2.8],
      [5.0, 1.4],
      [0.001, 1.0],
    ],
    64,
    90,
  );
}

/** Couvercle retourné : coupelle où l'on dépose les prisonniers. */
export function lidGeometry(): THREE.LatheGeometry {
  return lathe(
    [
      [0, 0],
      [4.9, 0],
      [6.0, 0.45],
      [6.35, 1.7],
      [6.0, 1.75],
      [5.7, 0.9],
      [4.6, 0.6],
      [0.001, 0.6],
    ],
    64,
    60,
  );
}

/** Pied « kuchinashi » (fruit de gardénia) : tourné à huit pans. */
export function legGeometry(): THREE.BufferGeometry {
  const g = lathe(
    [
      [0, 0],
      [1.9, 0],
      [2.6, 0.5],
      [3.3, 2.6],
      [4.3, 6.2],
      [4.5, 8.2],
      [3.7, 10.4],
      [2.9, LEG_HEIGHT],
    ],
    8,
    26,
  ).toNonIndexed();
  g.computeVertexNormals();
  return g;
}
