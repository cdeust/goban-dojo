import { useEffect, useMemo } from 'react';
import { displayOf, isEstimating, useStore } from '../state/store.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, STONE_THICKNESS, pointToWorld } from './dimensions.ts';
import { haloTexture } from './textures.ts';

export function SimulationMarks() {
  const glow = useMemo(haloTexture, []);
  useEffect(() => () => glow.dispose(), [glow]);
  const anchor = useStore((s) => s.move);
  const played = useStore((s) => s.variation.length);
  const stones = useStore((s) => {
    if (!isEstimating(s) && s.mode !== 'etudier') return null;
    if (!s.variation.length) return null;
    return displayOf(s)?.timeline.stones ?? null;
  });
  const shown = anchor + played;
  return stones?.map(({ placedAt, capturedAt, point }) => {
    if (placedAt <= anchor || placedAt > shown || capturedAt <= shown) return null;
    const [x, z] = pointToWorld(point);
    return (
      <mesh
        key={placedAt}
        position={[x, BOARD_TOP + STONE_THICKNESS / 2, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={STONE_DIAMETER_BLACK * 1.65}
        raycast={() => null}
      >
        <planeGeometry />
        <meshBasicMaterial
          map={glow}
          color="#a2eaff"
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    );
  });
}
