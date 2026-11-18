import { useStore } from '../state/store.ts';
import { studyOf } from '../state/study.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, STONE_THICKNESS, pointToWorld } from './dimensions.ts';

export function StudyMarks() {
  const entry = useStore((s) => {
    if (s.mode !== 'etudier' || s.studyMove !== s.move) return null;
    const game = s.dataset?.games[s.gameIndex];
    return game ? (studyOf(game).find((item) => item.number === s.move) ?? null) : null;
  });

  if (!entry) return null;
  const marks = [
    { points: [entry.move.point], color: '#ffdf91', onStone: true },
    { points: entry.captures, color: '#984025', onStone: false },
    { points: entry.atari, color: '#ff826a', onStone: true },
    { points: entry.connects, color: '#9bd1fe', onStone: true },
  ];
  return (
    <group>
      {marks.flatMap(({ points, color, onStone }) =>
        points.map((point) => {
          const [x, z] = pointToWorld(point);
          return (
            <mesh
              key={point}
              position={[x, BOARD_TOP + (onStone ? STONE_THICKNESS : 0.03), z]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={STONE_DIAMETER_BLACK}
              raycast={() => null}
            >
              <ringGeometry args={[0.27, 0.35, 32]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}
