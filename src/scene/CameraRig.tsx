import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { animate } from 'motion';
import { useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '../replay/motionPreference.ts';
import { useStore, type ViewName } from '../state/store.ts';
import { BOARD_LENGTH, BOARD_TOP, BOARD_WIDTH, PITCH_X, PITCH_Z } from './dimensions.ts';

const TARGET = new THREE.Vector3(0, BOARD_TOP - 1, 0);

/** Position de l'œil pour chaque point de vue, relative au centre du goban (cm). */
const VIEWS: Record<ViewName | 'ouverture', [number, number, number]> = {
  joueur: [0, 47, 88],
  'trois-quarts': [74, 35, 98],
  dessus: [0, 128, 0.6],
  ouverture: [-70, 30, 128],
};

/** Caméra : transitions entre points de vue animées par Motion, orbite libre à la souris. */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const view = useStore((s) => s.view);
  const entered = useStore((s) => s.entered);
  const studying = useStore((s) => s.mode === 'etudier' || s.studyOrigin !== null);
  const compactStudy =
    studying && entered && view === 'dessus' && window.matchMedia('(width < 60rem)').matches;
  const first = useRef(true);
  // Écran étroit : on recule pour garder le goban entier dans le cadre.
  const narrow = Math.min(2.4, Math.max(1, 1.18 / aspect));

  useEffect(() => {
    // Aide à la mise au point : /?oeil=x,y,z place la caméra à cette position (cm, relative au goban).
    const forced = new URLSearchParams(window.location.search).get('oeil')?.split(',').map(Number);
    const preset =
      forced?.length === 3 && forced.every(Number.isFinite)
        ? (forced as [number, number, number])
        : VIEWS[entered ? view : 'ouverture'];
    const to = new THREE.Spherical().setFromVector3(new THREE.Vector3(...preset));
    if (compactStudy && !forced && camera instanceof THREE.PerspectiveCamera) {
      // Garder une intersection de marge de chaque côté pour voir et jouer sur les bords.
      const height = Math.max(BOARD_LENGTH + 2 * PITCH_Z, (BOARD_WIDTH + 2 * PITCH_X) / aspect);
      const halfAngle = THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
      to.radius = height / (2 * Math.tan(halfAngle)) + BOARD_TOP - TARGET.y;
    } else {
      to.radius *= narrow;
    }
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
  }, [view, entered, narrow, aspect, compactStudy, camera, invalidate]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={12}
      maxDistance={420}
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI * 0.47}
      autoRotate={!entered && !prefersReducedMotion()}
      autoRotateSpeed={0.35}
    />
  );
}
