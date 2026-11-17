import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SIZE } from '../domain/board.ts';
import { displayOf, nextColor, useStore } from '../state/store.ts';
import {
  BOARD_LENGTH,
  BOARD_TOP,
  BOARD_WIDTH,
  PITCH_X,
  PITCH_Z,
  STONE_DIAMETER_BLACK,
  pointToWorld,
} from './dimensions.ts';
import { stoneAssets } from './materials.ts';

/** Intersection la plus proche d'un point du plateau, ou -1 si l'on est hors de la grille. */
function nearestPoint(x: number, z: number): number {
  const gx = Math.round(x / PITCH_X + 9);
  const gy = Math.round(z / PITCH_Z + 9);
  if (gx < 0 || gx >= SIZE || gy < 0 || gy >= SIZE) return -1;
  return gy * SIZE + gx;
}

/** Au-delà de ce déplacement (px) entre l'appui et le relâchement, c'est une rotation de caméra. */
const CLICK_SLOP = 6;

/**
 * Saisie sur le goban dans les modes « deviner » et « explorer » : une pierre fantôme suit le
 * pointeur, un clic pose ou propose un coup. Affiche aussi la zone d'indice et les essais manqués.
 */
export function BoardInput() {
  const mode = useStore((s) => s.mode);
  const zone = useStore((s) => s.guess.zone);
  const wrong = useStore((s) => s.guess.wrong);
  const invalidate = useThree((s) => s.invalidate);
  const assets = stoneAssets();
  const ghost = useRef<THREE.Mesh>(null);
  const hovered = useRef(-1);

  const materials = useMemo(
    () => ({
      B: new THREE.MeshStandardMaterial({
        color: '#131315',
        transparent: true,
        opacity: 0.55,
        roughness: 0.5,
      }),
      W: new THREE.MeshStandardMaterial({
        color: '#f6f3ea',
        transparent: true,
        opacity: 0.6,
        roughness: 0.3,
      }),
    }),
    [],
  );

  const active = mode !== 'lecture';

  const hide = (): void => {
    hovered.current = -1;
    if (ghost.current) ghost.current.visible = false;
    document.body.style.cursor = '';
    invalidate();
  };

  useEffect(() => {
    if (!active) hide();
    return () => {
      document.body.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `hide` ne dépend que de refs
  }, [active]);

  if (!active) return null;

  /** Le point est-il libre dans la position affichée ? */
  const isFree = (p: number): boolean => {
    const d = displayOf(useStore.getState());
    if (!d) return false;
    return !d.timeline.stones.some(
      (s) => s.point === p && s.placedAt <= d.move && d.move < s.capturedAt,
    );
  };

  const onMove = (e: ThreeEvent<PointerEvent>): void => {
    const p = nearestPoint(e.point.x, e.point.z);
    if (p === hovered.current) return;
    const mesh = ghost.current;
    if (!mesh || p < 0 || !isFree(p)) return hide();
    hovered.current = p;
    const [x, z] = pointToWorld(p);
    mesh.position.set(x, BOARD_TOP, z);
    mesh.material = materials[nextColor(useStore.getState())];
    mesh.visible = true;
    document.body.style.cursor = 'pointer';
    invalidate();
  };

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    if (e.delta > CLICK_SLOP) return;
    const p = nearestPoint(e.point.x, e.point.z);
    if (p < 0) return;
    e.stopPropagation();
    useStore.getState().clickPoint(p);
    hide();
  };

  const zx = zone ? ((zone.x0 + zone.x1) / 2 - 9) * PITCH_X : 0;
  const zz = zone ? ((zone.y0 + zone.y1) / 2 - 9) * PITCH_Z : 0;

  return (
    <group>
      {/* Plan de saisie, invisible, au ras du plateau. */}
      <mesh
        position={[0, BOARD_TOP + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={onMove}
        onPointerOut={hide}
        onClick={onClick}
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_LENGTH]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh
        ref={ghost}
        geometry={assets.geometry}
        scale={STONE_DIAMETER_BLACK}
        visible={false}
        raycast={() => null}
      />

      {mode === 'deviner' && zone && (
        <mesh
          position={[zx, BOARD_TOP + 0.02, zz]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry
            args={[(zone.x1 - zone.x0 + 1) * PITCH_X, (zone.y1 - zone.y0 + 1) * PITCH_Z]}
          />
          <meshBasicMaterial
            color="#e0553a"
            transparent
            opacity={0.2}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {mode === 'deviner' &&
        wrong.map((p) => {
          const [x, z] = pointToWorld(p);
          return (
            <mesh
              key={p}
              position={[x, BOARD_TOP + 0.03, z]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <ringGeometry args={[0.42, 0.56, 32]} />
              <meshBasicMaterial
                color="#e0553a"
                transparent
                opacity={0.85}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          );
        })}
    </group>
  );
}
