/**
 * Le salon et ses deux joueurs : scène `shusaku_salon.glb`, fournie par le propriétaire du projet.
 *
 * Elle apporte le salon à tatamis, le goban, les bols, les coussins et deux personnages articulés
 * en tenue d'époque (modèles VRoid de pixiv sous CC0, vêtements générés par code ; voir
 * public/modeles/PROVENANCE.md). Ses cotes sont celles de `dimensions.ts`, en mètres : on la
 * charge à l'échelle 100.
 *
 * Les pierres du fichier — la position figée d'un seul coup — sont masquées : celles qu'on voit
 * sont posées par le moteur de relecture, pour que toutes les parties se jouent dans ce décor.
 * Bols et couvercles servent aussi d'obstacles à la simulation physique des pierres.
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Color } from '../domain/board.ts';
import { useStore } from '../state/store.ts';
import { Mound } from './Mound.tsx';
import { BOWL, LID, STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE } from './dimensions.ts';
import { Pile, loadPhysics, type Rigid, type TriMesh } from './physics.ts';
import { Players } from './players.ts';
import { StageContext, type Stage } from './stage.ts';

const URL = 'modeles/shusaku_salon.glb';
/** Objets du fichier remplacés par ceux du moteur de relecture. */
const HIDDEN = new Set(['pierres', 'pierre_B_K11_coup127']);
/** Les couvercles gardent leur coupelle, pas les prisonniers figés qu'ils contiennent. */
const EMPTIED = new Set(['couvercle_noir', 'couvercle_blanc']);
const PRISONER = /^(pris|pierre)/;
/** Matériaux du disque qui figure le contenu des bols. */
const FILL = new Set(['pierre_noire', 'pierre_blanche']);
/** Matériau du bois des bols et couvercles : leur forme réelle, sans le contour à l'encre. */
const WOOD = 'bol_bois';
/** Matériaux à découper au seuil plutôt qu'à fondre. */
const CUTOUT = /HAIR|FaceBrow|FaceEyelash|FaceEyeline/;
const NAME = { B: 'noir', W: 'blanc' } as const;
const COLORS: Color[] = ['B', 'W'];

/** Pierres visibles dans un bol plein, et rayon (cm) dans lequel elles y sont lâchées. */
const BOWL_STONES = 22;
const BOWL_SPREAD = 3.2;
const BOWL_RIM = 9;
const LID_SPREAD = 2.6;
const LID_RIM = 2.2;

let pending: Promise<GLTF> | null = null;
const load = (): Promise<GLTF> =>
  (pending ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${URL}`));

/** Maillage du bois de l'objet `name`, en coordonnées de la scène. */
function woodOf(root: THREE.Object3D, name: string): TriMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  root.getObjectByName(name)?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).name !== WOOD) return;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    if (!index) return;
    const base = vertices.length / 3;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      vertices.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
  });
  if (indices.length === 0) throw new Error(`maillage de ${name} introuvable`);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Prépare le fichier pour l'affichage : objets masqués, ombres, textures, cheveux. */
function dress(root: THREE.Object3D, anisotropy: number): void {
  const lights: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (HIDDEN.has(o.name)) o.visible = false;
    // Dans un couvercle, on ne masque que les prisonniers figés, pas la coupelle elle-même.
    if (o.parent && EMPTIED.has(o.parent.name) && PRISONER.test(o.name)) o.visible = false;
    if ((o as THREE.Light).isLight) lights.push(o);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Les maillages animés par un squelette sortent de leur boîte englobante d'origine.
    mesh.frustumCulled = false;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const m = material as THREE.MeshStandardMaterial;
      // Le contenu des bols est un simple disque de couleur : les vraies pierres le remplacent.
      if (FILL.has(m.name)) mesh.visible = false;
      // Vues rasantes (tatamis, goban) : sans filtrage anisotrope, les textures moirent.
      if (m.map) {
        m.map.anisotropy = anisotropy;
        m.map.needsUpdate = true;
      }
      // Cheveux, sourcils, cils : en transparence sans profondeur, les mèches se traversent.
      // Un seuil d'opacité les rend nets et correctement triés.
      if (m.transparent && CUTOUT.test(m.name)) {
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
        m.needsUpdate = true;
      }
    }
  });
  // L'éclairage est celui de l'application, réglé avec ses ombres.
  for (const light of lights) light.removeFromParent();
}

interface Loaded {
  scene: THREE.Object3D;
  stage: Stage;
  /** Pierres au repos dans chaque bol. */
  bowls: Record<Color, Rigid[]>;
}

/** Le salon ; `children` (les pierres) n'est monté qu'une fois la scène et la physique prêtes. */
export function Salon({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    let alive = true;
    void Promise.all([load(), loadPhysics()]).then(([gltf, rapier]) => {
      if (!alive) return;
      const root = gltf.scene;
      root.scale.setScalar(100);
      root.updateMatrixWorld(true);
      dress(root, gl.capabilities.getMaxAnisotropy());
      const clip = gltf.animations[0];
      if (!clip) throw new Error('la scène ne contient pas le geste des joueurs');
      const players = new Players(root, clip);
      // Accès de mise au point (scripts/dev/rig.ts) ; absent de la version construite.
      if (import.meta.env.DEV) (window as unknown as { __players?: Players }).__players = players;

      const wood = (kind: string, c: Color): TriMesh => woodOf(root, `${kind}_${NAME[c]}`);
      const pile = (c: Color, lid: boolean): Pile =>
        new Pile(rapier, {
          fixed: lid ? [wood('couvercle', c), wood('bol', c)] : [wood('bol', c)],
          centre: lid ? LID[c] : BOWL[c],
          spread: lid ? LID_SPREAD : BOWL_SPREAD,
          rim: lid ? LID_RIM : BOWL_RIM,
          // Un bol contient les pierres de son joueur ; son couvercle, celles de l'adversaire.
          diameter: (c === 'B') === lid ? STONE_DIAMETER_WHITE : STONE_DIAMETER_BLACK,
          seed: (c === 'B' ? 1 : 2) + (lid ? 10 : 0),
        });
      const bowl = (c: Color): Rigid[] => {
        const stones = pile(c, false);
        return Array.from({ length: BOWL_STONES }, (_, k) => stones.rest(k));
      };
      setLoaded({
        scene: root,
        stage: { players, lids: { B: pile('B', true), W: pile('W', true) } },
        bowls: { B: bowl('B'), W: bowl('W') },
      });
      useStore.getState().setSceneReady();
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [invalidate, gl]);

  // Les matériaux du fichier sont faits pour un rendu sans compression des tons.
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    invalidate();
  }, [gl, invalidate]);

  return (
    <>
      <color attach="background" args={['#efe7d6']} />
      <hemisphereLight args={['#ffffff', '#b8a98a', 1.6]} />
      {/* Le jour entre par les shōji, du côté +x du salon. */}
      <directionalLight
        position={[120, 220, 80]}
        intensity={3}
        color="#fff5e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.5}
        shadow-radius={2}
      >
        <orthographicCamera attach="shadow-camera" args={[-150, 150, 150, -150, 20, 600]} />
      </directionalLight>
      {loaded && (
        <>
          <primitive object={loaded.scene} />
          {COLORS.map((c) => (
            <Mound key={c} color={c} stones={loaded.bowls[c]} />
          ))}
          <StageContext value={loaded.stage}>{children}</StageContext>
        </>
      )}
    </>
  );
}
