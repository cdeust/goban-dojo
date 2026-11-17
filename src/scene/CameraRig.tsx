import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { useStore, type ViewName } from '../state/store.ts';
import { BOARD_TOP } from './dimensions.ts';

const TARGET = new THREE.Vector3(0, BOARD_TOP - 1, 0);

/** Position de l'œil pour chaque point de vue, relative au centre du goban (cm). */
type Views = Record<ViewName | 'ouverture', [number, number, number]>;

/** Rendu réaliste : le goban seul dans la pièce. */
const VIEWS_REALISTE: Views = {
  joueur: [0, 47, 88],
  'trois-quarts': [74, 35, 98],
  dessus: [0, 128, 0.6],
  ouverture: [-70, 30, 128],
};

/**
 * Salon aux deux joueurs : positions des caméras du fichier (cam_epaule_noir, cam_large,
 * cam_dessus), ramenées au centre du goban.
 */
const VIEWS_MANGA: Views = {
  // Par-dessus l'épaule de Noir.
  joueur: [78, 112, 108],
  // Les deux joueurs face à face.
  'trois-quarts': [-205, 96, 168],
  dessus: [0, 129, 0.6],
  ouverture: [-230, 70, 190],
};

/** Caméra : transitions entre points de vue animées par Motion, orbite libre à la souris. */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const view = useStore((s) => s.view);
  const entered = useStore((s) => s.entered);
  const look = useStore((s) => s.look);
  const first = useRef(true);
  // Écran étroit : on recule pour garder le goban entier dans le cadre.
  const narrow = Math.min(2.4, Math.max(1, 1.18 / aspect));

  useEffect(() => {
    const preset = (look === 'manga' ? VIEWS_MANGA : VIEWS_REALISTE)[entered ? view : 'ouverture'];
    const to = new THREE.Spherical().setFromVector3(new THREE.Vector3(...preset));
    to.radius *= narrow;
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(TARGET));
    // Plus court chemin autour du goban.
    let dTheta = to.theta - from.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const s = new THREE.Spherical();
    const set = (t: number): void => {
      s.radius = from.radius + (to.radius - from.radius) * t;
      s.phi = from.phi + (to.phi - from.phi) * t;
      s.theta = from.theta + dTheta * t;
      s.makeSafe();
      camera.position.setFromSpherical(s).add(TARGET);
      camera.lookAt(TARGET);
      controls.current?.update();
      invalidate();
    };
    if (first.current || prefersReducedMotion()) {
      first.current = false;
      set(1);
      return;
    }
    const run = animate(0, 1, { duration: 1.9, ease: [0.65, 0, 0.35, 1], onUpdate: set });
    const c = controls.current;
    const cancel = (): void => run.stop();
    c?.addEventListener('start', cancel);
    return () => {
      run.stop();
      c?.removeEventListener('start', cancel);
    };
  }, [view, entered, narrow, look, camera, invalidate]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={42}
      maxDistance={420}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI * 0.47}
      autoRotate={!entered && !prefersReducedMotion()}
      autoRotateSpeed={0.35}
    />
  );
}
