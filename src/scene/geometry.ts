import * as THREE from 'three';
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
