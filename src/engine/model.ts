/**
 * Réseau livré avec l'application.
 *
 * kata1-b10c128-s1141046784-d204142634 : réseau officiel de KataGo (10 blocs, 128 canaux),
 * téléchargé depuis https://media.katagotraining.org/uploaded/networks/models/kata1/ puis
 * converti en ONNX par l'outil officiel `katago dumponnx` (KataGo v1.18.2). Licence : voir
 * public/engine/LICENCE.txt.
 */
export const MODEL = {
  name: 'kata1-b10c128-s1141046784-d204142634',
  file: 'engine/kata1-b10c128-s1141046784-d204142634.onnx',
  /** Empreinte vérifiée dans le navigateur avant tout usage du fichier. */
  sha256: '293bf3c07a74e541dca65f086fac8ae62703290d05810dfc603f5d7070f11122',
  bytes: 12_007_739,
  /** `katago.postProcess.outputScaleMultiplier` : les sorties brutes sont à multiplier par 8. */
  outputScale: 8,
} as const;
