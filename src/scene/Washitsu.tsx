import { useMemo } from 'react';
import * as THREE from 'three';
import {
  TIMBER,
  fusumaTexture,
  lanternTexture,
  scrollTexture,
  shojiTexture,
  wallTexture,
} from './roomTextures.ts';

/** Dimensions du salon (cm). Le goban est au centre ; Noir, et la caméra, sont du côté +z. */
const HALF_WIDTH = 235;
const BACK = -255;
const FRONT = 250;
const HEIGHT = 245;
/** Hauteur des panneaux coulissants, et de la poutre (nageshi) qui court au-dessus. */
const PANEL = 182;
const POST = 11;

/** Largeur d'un panneau de shōji, et leur nombre le long du mur gauche. */
const SHOJI_COUNT = 4;
const SHOJI_WIDTH = (FRONT - BACK) / SHOJI_COUNT;

/** Le tokonoma occupe la gauche du mur du fond ; deux fusuma, la droite. */
const TOKO = { x0: -HALF_WIDTH, x1: -40, depth: 34, floor: 13 };
const FUSUMA_WIDTH = (HALF_WIDTH + 40) / 2;

/**
 * Le salon à tatamis : shōji éclairés à gauche, tokonoma et fusuma au fond, mur d'argile à
 * droite, poteaux, poutre, et une lampe de papier.
 */
export function Washitsu() {
  const m = useMemo(() => {
    // Le papier laisse passer la lumière : `glow` le fait luire.
    const surface = (map: THREE.Texture | null, color: string, glow = 0): THREE.Material =>
      new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : color,
        roughness: 0.9,
        ...(map ? { map } : {}),
        ...(glow > 0 && map
          ? { emissive: '#fff2d6', emissiveMap: map, emissiveIntensity: glow }
          : {}),
      });
    const wall = wallTexture();
    wall.repeat.set(6, 3);
    return {
      wall: surface(wall, '#dccba0'),
      alcove: surface(null, '#c9b68a'),
      timber: surface(null, TIMBER),
      shoji: surface(shojiTexture(), '#fbf6e9', 0.85),
      fusuma: [surface(fusumaTexture(false), '#efe5c9'), surface(fusumaTexture(true), '#efe5c9')],
      scroll: surface(scrollTexture(), '#f4ecd8'),
      lantern: surface(lanternTexture(), '#ffd98a', 1.6),
      lacquer: surface(null, '#221712'),
    };
  }, []);

  const wallHeight = HEIGHT - PANEL;
  const depth = FRONT - BACK;

  return (
    <group>
      {/* Mur gauche : quatre shōji, et le mur d'argile au-dessus. */}
      {Array.from({ length: SHOJI_COUNT }, (_, i) => (
        <mesh
          key={i}
          material={m.shoji}
          position={[-HALF_WIDTH, PANEL / 2, BACK + SHOJI_WIDTH * (i + 0.5)]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[SHOJI_WIDTH, PANEL]} />
        </mesh>
      ))}
      <mesh
        material={m.wall}
        position={[-HALF_WIDTH, PANEL + wallHeight / 2, (BACK + FRONT) / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, wallHeight]} />
      </mesh>

      {/* Mur droit : argile nue. */}
      <mesh
        material={m.wall}
        position={[HALF_WIDTH, HEIGHT / 2, (BACK + FRONT) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[depth, HEIGHT]} />
      </mesh>

      {/* Mur du fond, au-dessus des panneaux. */}
      <mesh material={m.wall} position={[0, PANEL + wallHeight / 2, BACK]}>
        <planeGeometry args={[HALF_WIDTH * 2, wallHeight]} />
      </mesh>

      {/* Tokonoma : renfoncement, estrade, rouleau. */}
      <mesh material={m.alcove} position={[(TOKO.x0 + TOKO.x1) / 2, PANEL / 2, BACK - TOKO.depth]}>
        <planeGeometry args={[TOKO.x1 - TOKO.x0, PANEL]} />
      </mesh>
      <mesh
        material={m.alcove}
        position={[TOKO.x1, PANEL / 2, BACK - TOKO.depth / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[TOKO.depth, PANEL]} />
      </mesh>
      <mesh
        material={m.lacquer}
        position={[(TOKO.x0 + TOKO.x1) / 2, TOKO.floor / 2, BACK - TOKO.depth / 2]}
      >
        <boxGeometry args={[TOKO.x1 - TOKO.x0, TOKO.floor, TOKO.depth]} />
      </mesh>
      <mesh material={m.scroll} position={[(TOKO.x0 + TOKO.x1) / 2, 104, BACK - TOKO.depth + 1.5]}>
        <planeGeometry args={[48, 144]} />
      </mesh>

      {/* Deux fusuma. */}
      {[0, 1].map((i) => (
        <mesh
          key={i}
          material={m.fusuma[i]}
          position={[TOKO.x1 + FUSUMA_WIDTH * (i + 0.5), PANEL / 2, BACK]}
        >
          <planeGeometry args={[FUSUMA_WIDTH, PANEL]} />
        </mesh>
      ))}

      {/* Poteaux et poutre. */}
      {[
        [-HALF_WIDTH, BACK],
        [HALF_WIDTH, BACK],
        [TOKO.x1, BACK],
        [-HALF_WIDTH, FRONT],
        [HALF_WIDTH, FRONT],
      ].map(([x, z]) => (
        <mesh
          key={`${x}:${z}`}
          material={m.timber}
          position={[x as number, HEIGHT / 2, z as number]}
        >
          <boxGeometry args={[POST, HEIGHT, POST]} />
        </mesh>
      ))}
      <mesh material={m.timber} position={[0, PANEL + 4, BACK + 2]}>
        <boxGeometry args={[HALF_WIDTH * 2, 9, 5]} />
      </mesh>
      <mesh material={m.timber} position={[-HALF_WIDTH + 2, PANEL + 4, (BACK + FRONT) / 2]}>
        <boxGeometry args={[5, 9, depth]} />
      </mesh>
      <mesh material={m.timber} position={[HALF_WIDTH - 2, PANEL + 4, (BACK + FRONT) / 2]}>
        <boxGeometry args={[5, 9, depth]} />
      </mesh>

      {/* Lampe de papier (andon), près des fusuma. */}
      <group position={[168, 0, BACK + 62]}>
        <mesh material={m.lantern} position={[0, 46, 0]}>
          <boxGeometry args={[26, 58, 26]} />
        </mesh>
        <mesh material={m.lacquer} position={[0, 8.5, 0]}>
          <boxGeometry args={[30, 17, 30]} />
        </mesh>
      </group>
    </group>
  );
}
