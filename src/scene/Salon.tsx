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

const URL = 'modeles/shusaku_salon.glb';
/** Objets du fichier remplacés par ceux du moteur de relecture. */
const HIDDEN = new Set(['pierres', 'pierre_B_K11_coup127']);
/** Les couvercles gardent leur coupelle, pas les prisonniers figés qu'ils contiennent. */
const EMPTIED = new Set(['couvercle_noir', 'couvercle_blanc']);

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
      root.traverse((o) => {
        if (HIDDEN.has(o.name)) o.visible = false;
        if (EMPTIED.has(o.name)) for (const child of o.children) child.visible = false;
        if ((o as THREE.Light).isLight) lights.push(o);
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // Les maillages animés par un squelette sortent de leur boîte englobante d'origine.
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
        }
      });
      // L'éclairage est celui de l'application, réglé avec ses ombres.
      for (const light of lights) light.removeFromParent();
      // Pose d'attente : la première image de l'animation fournie.
      const clip = loaded.animations[0];
      if (clip) {
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(clip).play();
        mixer.setTime(0);
      }
      setGltf(loaded);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [invalidate]);

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
        shadow-bias={-0.0004}
        shadow-normalBias={0.25}
        shadow-radius={2}
      >
        <orthographicCamera attach="shadow-camera" args={[-190, 190, 190, -190, 20, 600]} />
      </directionalLight>
      {gltf && <primitive object={gltf.scene} />}
    </>
  );
}
