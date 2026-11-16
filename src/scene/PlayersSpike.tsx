/**
 * ESSAI, non publié : un personnage articulé assis en seiza devant le goban, dont le bras droit
 * va jusqu'à une intersection. Sert à juger si la voie « vrais joueurs » tient à l'image.
 *
 * Visible à l'adresse /?essai. Le personnage est l'exemple officiel VRM1_Constraint_Twist_Sample
 * (© 2022 pixiv Inc., VRM Public License 1.0, redistribution et modification autorisées), à placer
 * dans public/essai/joueur.vrm — il n'est pas versionné :
 *   curl -L -o public/essai/joueur.vrm \
 *     https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm
 *   (SHA-256 commençant par 12c2b97e95e700783a6a)
 *
 * Acquis : chargement, pose assise, cinématique inverse du bras, doigts, ombre.
 * Reste à faire avant toute intégration : personnages en tenue d'époque, cadrages, cycle complet
 * du geste (bol, prise, pose, retrait, capture), regard et expressions.
 */
import { VRMLoaderPlugin, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BOARD_TOP, STONE_THICKNESS, pointToWorld } from './dimensions.ts';

const DEG = Math.PI / 180;

/** Les personnages sont modélisés en mètres ; la scène est en centimètres. */
const SCALE = 100;

function pose(vrm: VRM, bone: VRMHumanBoneName, x: number, y: number, z: number): void {
  vrm.humanoid.getNormalizedBoneNode(bone)?.rotation.set(x * DEG, y * DEG, z * DEG);
}

/** Seiza : cuisses à l'horizontale vers l'avant, jambes repliées dessous, buste à peine penché. */
function sit(vrm: VRM): void {
  for (const side of ['left', 'right'] as const) {
    pose(vrm, `${side}UpperLeg`, -92, 0, side === 'left' ? 4 : -4);
    pose(vrm, `${side}LowerLeg`, 150, 0, 0);
    pose(vrm, `${side}Foot`, 60, 0, 0);
  }
  pose(vrm, 'spine', 8, 0, 0);
  pose(vrm, 'chest', 6, 0, 0);
  pose(vrm, 'neck', 14, 0, 0);
  pose(vrm, 'head', 10, 0, 0);
  // Main gauche posée sur la cuisse.
  pose(vrm, 'leftUpperArm', 0, 0, 68);
  pose(vrm, 'leftLowerArm', 0, -70, 0);
  pose(vrm, 'leftHand', 0, 0, 10);
}

/** Prise de la pierre : index et majeur tendus, annulaire et auriculaire repliés, pouce rentré. */
function grip(vrm: VRM): void {
  for (const f of ['Ring', 'Little'] as const) {
    pose(vrm, `right${f}Proximal`, 0, 0, 75);
    pose(vrm, `right${f}Intermediate`, 0, 0, 85);
    pose(vrm, `right${f}Distal`, 0, 0, 60);
  }
  pose(vrm, 'rightIndexProximal', 0, 0, 12);
  pose(vrm, 'rightMiddleProximal', 0, 0, 4);
  pose(vrm, 'rightThumbMetacarpal', 0, -30, 0);
  pose(vrm, 'rightThumbProximal', 0, -35, 0);
}

const v = {
  shoulder: new THREE.Vector3(),
  elbow: new THREE.Vector3(),
  wrist: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  axis: new THREE.Vector3(),
  upper: new THREE.Vector3(),
  fore: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
};
/** Dans la pose de référence, le bras droit pointe vers −x. */
const REST = new THREE.Vector3(-1, 0, 0);

/**
 * Cinématique inverse à deux os : oriente bras et avant-bras pour que le poignet atteigne
 * `target` (repère du monde), le coude tiré vers `pole`.
 */
function reach(vrm: VRM, target: THREE.Vector3, pole: THREE.Vector3): void {
  const upper = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
  const lower = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
  const hand = vrm.humanoid.getNormalizedBoneNode('rightHand');
  if (!upper || !lower || !hand) return;
  upper.rotation.set(0, 0, 0);
  lower.rotation.set(0, 0, 0);
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(v.shoulder);
  lower.getWorldPosition(v.elbow);
  hand.getWorldPosition(v.wrist);
  const a = v.shoulder.distanceTo(v.elbow);
  const b = v.elbow.distanceTo(v.wrist);
  v.dir.copy(target).sub(v.shoulder);
  const d = Math.min(v.dir.length(), (a + b) * 0.999);
  v.dir.normalize();
  // Angle entre la direction de la cible et le bras (loi des cosinus).
  const A = Math.acos(THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  v.axis.crossVectors(v.dir, pole).normalize();
  v.upper.copy(v.dir).applyAxisAngle(v.axis, A);
  v.elbow.copy(v.shoulder).addScaledVector(v.upper, a);
  v.fore.copy(v.shoulder).addScaledVector(v.dir, d).sub(v.elbow).normalize();

  upper.parent?.getWorldQuaternion(v.parent);
  v.upper.applyQuaternion(v.parent.invert());
  upper.quaternion.setFromUnitVectors(REST, v.upper);
  upper.updateWorldMatrix(true, false);
  upper.getWorldQuaternion(v.parent);
  v.fore.applyQuaternion(v.parent.invert());
  lower.quaternion.setFromUnitVectors(REST, v.fore);
}

export function PlayersSpike() {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const t = useRef(0);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    void loader.loadAsync(`${import.meta.env.BASE_URL}essai/joueur.vrm`).then((gltf) => {
      const loaded = gltf.userData.vrm as VRM;
      loaded.scene.traverse((o) => {
        o.frustumCulled = false;
        o.castShadow = true;
      });
      sit(loaded);
      grip(loaded);
      setVrm(loaded);
    });
  }, []);

  useFrame((_, delta) => {
    if (!vrm) return;
    t.current += delta;
    // Le bras va et vient entre une position de repos et une intersection du goban.
    const k = 0.5 - 0.5 * Math.cos(t.current * 1.6);
    const [x, z] = pointToWorld(9 * 19 + 12);
    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(14, x, k),
      THREE.MathUtils.lerp(BOARD_TOP + 14, BOARD_TOP + STONE_THICKNESS + 6, k),
      THREE.MathUtils.lerp(46, z + 8, k),
    );
    reach(vrm, target, new THREE.Vector3(0.6, -1, 0.4));
    vrm.update(delta);
    invalidate();
  });

  if (!vrm) return null;
  // Assis du côté de Noir (+z), face au goban.
  return (
    <primitive
      object={vrm.scene}
      position={[0, -70, 80]}
      rotation={[0, Math.PI, 0]}
      scale={SCALE}
    />
  );
}
