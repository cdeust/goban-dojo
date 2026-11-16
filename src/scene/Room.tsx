import { Environment, Lightformer } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OUTLINE, inkMaterial, toon, useLook } from './look.ts';
import { PAPER, screentoneTexture, tatamiTexture } from './textures.ts';

const FLOOR = 900;
const MAT_WIDTH = 91;
const MAT_LENGTH = 182;
const NIGHT = '#0b0908';

/** La pièce : le sol, les coussins des joueurs et la lumière, selon le style. */
export function Room() {
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const look = useLook();
  const manga = look === 'manga';

  // Les aplats du manga ne supportent pas la compression des tons d'un rendu photographique.
  useEffect(() => {
    gl.toneMapping = manga ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    invalidate();
  }, [gl, manga, invalidate]);

  const { floor, cushion, cushionMaterial } = useMemo(() => {
    const cushion = new RoundedBoxGeometry(56, 6, 56, 6, 2.6);
    if (manga) {
      const map = screentoneTexture(anisotropy);
      map.repeat.set(FLOOR / 22, FLOOR / 22);
      return {
        floor: toon('#ffffff', [0.78, 1], map),
        cushion,
        cushionMaterial: toon('#39405c', [0.55, 0.8, 1]),
      };
    }
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
      cushion,
      cushionMaterial: new THREE.MeshStandardMaterial({ color: '#1f2638', roughness: 1 }),
    };
  }, [anisotropy, manga]);

  return (
    <>
      <color attach="background" args={[manga ? PAPER : NIGHT]} />
      {manga ? (
        <fog attach="fog" args={[PAPER, 260, 640]} />
      ) : (
        <fogExp2 attach="fog" args={[NIGHT, 0.0052]} />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={floor}>
        <planeGeometry args={[FLOOR, FLOOR]} />
      </mesh>

      {[1, -1].map((side) => (
        <group key={side} position={[0, 3, side * 66]}>
          <mesh geometry={cushion} material={cushionMaterial} castShadow receiveShadow />
          {manga && <mesh geometry={cushion} material={inkMaterial()} scale={OUTLINE.cushion} />}
        </group>
      ))}

      {/*
        Lumière principale, à gauche et légèrement devant Noir.
        Manga : c'est la seule lumière. Son intensité vaut π pour qu'une face pleinement éclairée
        rende exactement la couleur de sa rampe d'aplats ; la « lumière ambiante » est la bande la
        plus sombre de chaque rampe, et les ombres portées sont une demi-teinte, pas un noir.
      */}
      <directionalLight
        position={[-120, 135, 55]}
        intensity={manga ? Math.PI : 3.1}
        color={manga ? '#ffffff' : '#fff1dc'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={manga ? 0.35 : 0.04}
        shadow-radius={manga ? 1 : 3}
        shadow-intensity={manga ? 0.3 : 1}
      >
        <orthographicCamera attach="shadow-camera" args={[-75, 75, 75, -75, 20, 420]} />
      </directionalLight>
      {!manga && (
        <>
          <hemisphereLight args={['#ffe6c4', '#2b2118', 0.26]} />
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
      )}
    </>
  );
}
