import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { useCurrentGame, useStore } from '../state/store.ts';

import { BoardInput } from './BoardInput.tsx';
import { Bowls } from './Bowls.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Goban } from './Goban.tsx';
import { Marks } from './Marks.tsx';
import { Room } from './Room.tsx';
import { Stones } from './Stones.tsx';

/** Marque le canvas dès qu'une image contenant de la géométrie a été dessinée (repère pour les tests). */
function RenderProbe() {
  const gl = useThree((s) => s.gl);
  const done = useRef(false);
  useFrame(() => {
    if (done.current || gl.info.render.triangles === 0) return;
    done.current = true;
    gl.domElement.dataset.rendered = 'true';
  });
  return null;
}

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
      aria-hidden="true"
    >
      <Room />
      <Goban />
      <Bowls />
      {game && <Stones key={game.id} seed={game.id} />}
      <Marks />
      <BoardInput />
      <CameraRig />
      <RenderProbe />
    </Canvas>
  );
}
