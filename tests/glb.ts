/** Lecture minimale d'un fichier GLB pour les tests : maillage d'un nœud, en centimètres. */
import { readFileSync } from 'node:fs';

interface Gltf {
  nodes: { name?: string; mesh?: number; translation?: [number, number, number] }[];
  meshes: {
    primitives: { attributes: { POSITION: number }; indices: number; material: number }[];
  }[];
  materials: { name: string }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
}

export function readMesh(
  path: string,
  node: string,
  material: string,
): { vertices: Float32Array; indices: Uint32Array } {
  const file = readFileSync(path);
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
  const bin = file.subarray(20 + jsonLength + 8);
  const n = gltf.nodes.find((x) => x.name === node);
  if (!n || n.mesh === undefined) throw new Error(`nœud ${node} introuvable`);
  const primitive = gltf.meshes[n.mesh]?.primitives.find(
    (p) => gltf.materials[p.material]?.name === material,
  );
  if (!primitive) throw new Error(`matériau ${material} introuvable sur ${node}`);
  const view = (index: number) => {
    const a = gltf.accessors[index]!;
    const v = gltf.bufferViews[a.bufferView]!;
    return { a, v, offset: (v.byteOffset ?? 0) + (a.byteOffset ?? 0) };
  };
  const p = view(primitive.attributes.POSITION);
  const t = n.translation ?? [0, 0, 0];
  const vertices = new Float32Array(p.a.count * 3);
  const stride = p.v.byteStride ?? 12;
  for (let i = 0; i < p.a.count; i++)
    for (let k = 0; k < 3; k++)
      vertices[i * 3 + k] = (bin.readFloatLE(p.offset + i * stride + k * 4) + t[k]!) * 100;
  const x = view(primitive.indices);
  const indices = new Uint32Array(x.a.count);
  for (let i = 0; i < x.a.count; i++)
    indices[i] =
      x.a.componentType === 5125
        ? bin.readUInt32LE(x.offset + i * 4)
        : bin.readUInt16LE(x.offset + i * 2);
  return { vertices, indices };
}
