import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import { POINTS, SIZE } from '../domain/board.ts';
import { useStore } from '../state/store.ts';
import { BOARD_TOP, PITCH_X, PITCH_Z } from './dimensions.ts';

function OwnershipMap({ values }: { values: Float32Array }) {
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    return texture;
  }, []);

  useLayoutEffect(() => {
    const context = (texture.image as HTMLCanvasElement).getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(SIZE, SIZE);
    for (let point = 0; point < POINTS; point++) {
      const value = values[point] ?? 0;
      const offset = 4 * point;
      const color = value >= 0 ? [54, 173, 255] : [245, 177, 92];
      pixels.data.set(color, offset);
      pixels.data[offset + 3] = Math.round(Math.abs(value) * 128);
    }
    context.putImageData(pixels, 0, 0);
    texture.needsUpdate = true;
    invalidate();
  }, [values, texture, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, BOARD_TOP + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[PITCH_X * SIZE, PITCH_Z * SIZE]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function ReadingOwnership() {
  const values = useStore((s) => (s.mode === 'lire' ? s.readingOwnership : null));
  return values ? <OwnershipMap values={values} /> : null;
}
