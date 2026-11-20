import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { isEstimating, useStore } from '../state/store.ts';
import { tatamiTexture } from './textures.ts';
import { Washitsu } from './Washitsu.tsx';

const FLOOR = 900;
const MAT_WIDTH = 91;
const MAT_LENGTH = 182;
const NIGHT = '#0b0908';
const SHADOW = 0.004;
const FADE_SECONDS = 0.45;

/** La pièce : le salon, le sol de tatamis, les coussins des joueurs et la lumière. */
export function Room() {
  const estimating = useStore(isEstimating);
  const decor = useRef<THREE.Group>(null);
  const level = useRef(1);
  const invalidate = useThree((s) => s.invalidate);
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const { floor, cushion, cushionMaterial } = useMemo(() => {
    const map = tatamiTexture(anisotropy);
    const rx = FLOOR / MAT_WIDTH;
    const rz = FLOOR / MAT_LENGTH;
    map.repeat.set(rx, rz);
    // Une natte est centrée sous le goban.
    map.offset.set(0.5 - rx / 2, 0.5 - rz / 2);
    const bump = map.clone();
    bump.colorSpace = THREE.NoColorSpace;
    return {
      floor: new THREE.MeshStandardMaterial({
        map,
        bumpMap: bump,
        bumpScale: 0.6,
        roughness: 0.93,
      }),
      cushion: new RoundedBoxGeometry(56, 6, 56, 6, 2.6),
      cushionMaterial: new THREE.MeshStandardMaterial({ color: '#1f2638', roughness: 1 }),
    };
  }, [anisotropy]);

  // Le fondu agit sur les surfaces du salon, indépendamment de l'éclairage du goban.
  const paint = useRef<(value: number) => void>(() => {});
  useLayoutEffect(() => {
    const materials = new Set<THREE.MeshStandardMaterial>();
    decor.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const entries: unknown[] = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of entries) {
        if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
      }
    });
    const original = [...materials].map((material) => ({
      material,
      color: material.color.clone(),
      glow: material.emissiveIntensity,
      reflections: material.envMapIntensity,
    }));
    paint.current = (value) => {
      for (const { material, color, glow, reflections } of original) {
        material.color.copy(color).multiplyScalar(value);
        material.emissiveIntensity = glow * value;
        material.envMapIntensity = reflections * value;
      }
    };
    paint.current(level.current);
    return () => paint.current(1);
  }, [floor, cushionMaterial]);

  useLayoutEffect(() => {
    const end = estimating ? SHADOW : 1;
    const update = (value: number) => {
      level.current = value;
      paint.current(value);
      invalidate();
    };
    if (prefersReducedMotion() || level.current === end) {
      update(end);
      return;
    }
    const fade = animate(level.current, end, {
      duration: FADE_SECONDS,
      ease: 'easeInOut',
      onUpdate: update,
    });
    return () => fade.stop();
  }, [estimating, invalidate]);

  return (
    <>
      <color attach="background" args={[NIGHT]} />
      <fogExp2 attach="fog" args={[NIGHT, 0.0019]} />

      <group ref={decor}>
        <Washitsu />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floor}>
          <planeGeometry args={[FLOOR, FLOOR]} />
        </mesh>

        {[1, -1].map((side) => (
          <mesh
            key={side}
            position={[0, 3, side * 66]}
            geometry={cushion}
            material={cushionMaterial}
            castShadow
            receiveShadow
          />
        ))}
      </group>

      {/* Lumière principale, à gauche et légèrement devant Noir. */}
      <directionalLight
        position={[-120, 135, 55]}
        intensity={3.1}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-radius={3}
      >
        <orthographicCamera attach="shadow-camera" args={[-75, 75, 75, -75, 20, 420]} />
      </directionalLight>
      <hemisphereLight args={['#ffe6c4', '#2b2118', 0.7]} />
      {/* Lueur chaude d'une lampe, derrière Blanc. */}
      <pointLight
        position={[60, 70, -90]}
        intensity={5200}
        color="#ffb070"
        distance={320}
        decay={2}
      />
      {/* Environnement de réflexion, généré : pas de fichier HDR à télécharger. */}
      <Environment resolution={256} frames={1} background={false}>
        <color attach="background" args={['#0a0807']} />
        <Lightformer
          form="rect"
          intensity={5}
          color="#fff3e0"
          position={[-8, 3, 2]}
          scale={[10, 7, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#ffe2c0"
          position={[0, 9, 0]}
          scale={[12, 12, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="circle"
          intensity={2.4}
          color="#ffb070"
          position={[6, 2.5, -7]}
          scale={[2.5, 2.5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.5}
          color="#8fa2c8"
          position={[7, 1.5, 6]}
          scale={[6, 4, 1]}
          target={[0, 0, 0]}
        />
      </Environment>
    </>
  );
}
