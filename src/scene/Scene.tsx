import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useCurrentGame, useStore } from '../state/store.ts';
import { Bowls } from './Bowls.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Goban } from './Goban.tsx';
import { Room } from './Room.tsx';
import { Stones } from './Stones.tsx';

export function Scene() {
  const game = useCurrentGame();
  const entered = useStore((s) => s.entered);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      // Après l'ouverture, on ne redessine que lorsqu'une animation ou la caméra l'exige.
      frameloop={entered ? 'demand' : 'always'}
      camera={{ fov: 30, near: 4, far: 1600, position: [-78, 66, 96] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      aria-hidden="true"
    >
      <Room />
      <Goban />
      <Bowls />
      {game && <Stones key={game.id} game={game} />}
      <CameraRig />
    </Canvas>
  );
}
