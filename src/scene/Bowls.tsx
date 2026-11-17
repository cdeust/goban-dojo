import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Color } from '../domain/board.ts';
import { useStore } from '../state/store.ts';
import { BOWL, LID, STONE_DIAMETER_BLACK, STONE_DIAMETER_WHITE } from './dimensions.ts';
import { bowlGeometry, lidGeometry, triMeshOf } from './geometry.ts';
import { Mound } from './Mound.tsx';
import { Pile, loadPhysics, type Rigid } from './physics.ts';
import { StageContext, type Stage } from './stage.ts';
import { bowlTexture } from './textures.ts';

const COLORS: Color[] = ['B', 'W'];

/**
 * Réglages du remplissage. Un bol est profond : seules les pierres du dessus se voient, et un
 * fond caché à `BOWL_FLOOR` cm évite de simuler les cent cinquante pierres qui sont dessous.
 */
export const BOWL_FILL = { stones: 40, floor: 5.6, spread: 3.6, rim: 6.4 } as const;
export const LID_FILL = { spread: 2.6, rim: 1.75 } as const;

interface Ready {
  stage: Stage;
  /** Pierres au repos dans chaque bol. */
  mounds: Record<Color, Rigid[]>;
}

/**
 * Les deux bols et leurs couvercles retournés, à la droite de chaque joueur. Ils servent aussi
 * d'obstacles à la simulation des pierres ; `children` (les pierres du jeu) n'est monté qu'une
 * fois le moteur physique chargé.
 */
export function Bowls({ children }: { children: ReactNode }) {
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const invalidate = useThree((s) => s.invalidate);
  const [ready, setReady] = useState<Ready | null>(null);

  const { bowl, lid, material } = useMemo(() => {
    const map = bowlTexture(anisotropy);
    map.repeat.set(2, 1);
    return {
      bowl: bowlGeometry(),
      lid: lidGeometry(),
      material: new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.34,
        clearcoat: 0.55,
        clearcoatRoughness: 0.25,
        side: THREE.DoubleSide,
      }),
    };
  }, [anisotropy]);

  useEffect(() => {
    let alive = true;
    void loadPhysics().then((rapier) => {
      if (!alive) return;
      const pile = (c: Color, inLid: boolean): Pile =>
        new Pile(rapier, {
          fixed: inLid
            ? [triMeshOf(lid, LID[c]), triMeshOf(bowl, BOWL[c])]
            : [triMeshOf(bowl, BOWL[c])],
          centre: inLid ? LID[c] : BOWL[c],
          ...(inLid ? LID_FILL : BOWL_FILL),
          // Un bol contient les pierres de son joueur ; son couvercle, celles de l'adversaire.
          diameter: (c === 'B') === inLid ? STONE_DIAMETER_WHITE : STONE_DIAMETER_BLACK,
          seed: (c === 'B' ? 1 : 2) + (inLid ? 10 : 0),
        });
      const mound = (c: Color): Rigid[] => {
        const stones = pile(c, false);
        return Array.from({ length: BOWL_FILL.stones }, (_, k) => stones.rest(k));
      };
      setReady({
        stage: { lids: { B: pile('B', true), W: pile('W', true) } },
        mounds: { B: mound('B'), W: mound('W') },
      });
      useStore.getState().setSceneReady();
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [bowl, lid, invalidate]);

  return (
    <>
      {COLORS.map((c) => (
        <group key={c}>
          <mesh
            geometry={bowl}
            material={material}
            position={[BOWL[c].x, 0, BOWL[c].z]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={lid}
            material={material}
            position={[LID[c].x, 0, LID[c].z]}
            castShadow
            receiveShadow
          />
          {ready && <Mound color={c} stones={ready.mounds[c]} />}
        </group>
      ))}
      {ready && <StageContext value={ready.stage}>{children}</StageContext>}
    </>
  );
}
