import * as THREE from 'three';
import { LEG_HEIGHT } from './dimensions.ts';
import type { TriMesh } from './physics.ts';
import { stoneProfile } from './stoneShape.ts';

/** Maillage d'une pierre de diamètre 1 (mise à l'échelle par instance), posée sur y = 0. */
export function stoneGeometry(diameter: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    stoneProfile(diameter).map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  // UV planaires vues de dessus : les stries de la coquille traversent la pierre en ligne droite.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getZ(i) + 0.5);
  g.computeVertexNormals();
  return g;
}

/** Triangles d'une géométrie posée en (x, 0, z) : l'obstacle que la simulation en fait. */
export function triMeshOf(geometry: THREE.BufferGeometry, at: { x: number; z: number }): TriMesh {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('géométrie sans index');
  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    vertices[i * 3] = position.getX(i) + at.x;
    vertices[i * 3 + 1] = position.getY(i);
    vertices[i * 3 + 2] = position.getZ(i) + at.z;
  }
  return { vertices, indices: Uint32Array.from(index.array) };
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
