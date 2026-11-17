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
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Color } from '../domain/board.ts';
import { Mound } from './Bowls.tsx';
import { BOWL } from './dimensions.ts';
import { Players, setPlayers } from './players.ts';

const URL = 'modeles/shusaku_salon.glb';
/** Objets du fichier remplacés par ceux du moteur de relecture. */
const HIDDEN = new Set(['pierres', 'pierre_B_K11_coup127']);
/** Les couvercles gardent leur coupelle, pas les prisonniers figés qu'ils contiennent. */
const EMPTIED = new Set(['couvercle_noir', 'couvercle_blanc']);
const PRISONER = /^(pris|pierre)/;
/** Matériaux du disque qui figure le contenu des bols. */
const FILL = new Set(['pierre_noire', 'pierre_blanche']);
/** Matériaux à découper au seuil plutôt qu'à fondre. */
const CUTOUT = /HAIR|FaceBrow|FaceEyelash|FaceEyeline/;

let pending: Promise<GLTF> | null = null;
const load = (): Promise<GLTF> =>
  (pending ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${URL}`));

export function Salon() {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    let alive = true;
    void load().then((loaded) => {
      if (!alive) return;
      const root = loaded.scene;
      root.scale.setScalar(100);
      const lights: THREE.Object3D[] = [];
      const anisotropy = gl.capabilities.getMaxAnisotropy();
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
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
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
      const clip = loaded.animations[0];
      if (clip) {
        const players = new Players(root, clip);
        setPlayers(players);
        // Accès de mise au point (scripts/dev/rig.ts) ; absent de la version construite.
        if (import.meta.env.DEV) (window as unknown as { __players?: Players }).__players = players;
      }
      setGltf(loaded);
      invalidate();
    });
    return () => {
      alive = false;
      setPlayers(null);
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
      {gltf && <primitive object={gltf.scene} />}
      {/* Les bols de la scène, garnis de vraies pierres. */}
      {gltf &&
        (['B', 'W'] as Color[]).map((c) => (
          <group key={c} position={[BOWL[c].x, 0, BOWL[c].z]}>
            <Mound color={c} />
          </group>
        ))}
    </>
  );
}
