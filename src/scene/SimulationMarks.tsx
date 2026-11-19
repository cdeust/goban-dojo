import { displayOf, useStore } from '../state/store.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, STONE_THICKNESS, pointToWorld } from './dimensions.ts';

export function SimulationMarks() {
  const anchor = useStore((s) => s.move);
  const played = useStore((s) => s.variation.length);
  const stones = useStore((s) => {
    if (s.reflectionReplay !== 'auto' && s.reflectionReplay !== 'manual') return null;
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
        scale={STONE_DIAMETER_BLACK}
        raycast={() => null}
      >
        <ringGeometry args={[0.49, 0.65, 40]} />
        <meshBasicMaterial
          color="#a2eaff"
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    );
  });
}
