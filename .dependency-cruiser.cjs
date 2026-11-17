/**
 * Garde d'architecture : les couches décrites dans le README sont vérifiées, pas seulement
 * décrites. `pnpm arch` échoue sur tout import qui franchit une frontière ou crée un cycle.
 */
module.exports = {
  forbidden: [
    {
      name: 'pas-de-cycle',
      severity: 'error',
      comment: 'Aucun cycle d’imports.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domaine-pur',
      severity: 'error',
      comment:
        'Le domaine (SGF, règles, vie des pierres) ne dépend de rien : ni bibliothèque, ni autre couche.',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'recit-sans-interface',
      severity: 'error',
      comment: 'Le récit ne connaît que le domaine.',
      from: { path: '^src/story/' },
      to: { pathNot: '^src/(story|domain)/' },
    },
    {
      name: 'moteur-pur',
      severity: 'error',
      comment:
        'Encodage, décodage et jugement sont du calcul pur : ils ne connaissent que le domaine.',
      from: { path: '^src/engine/(features|decode|judge|model|protocol)\\.ts$' },
      to: { pathNot: '^src/(engine/(features|decode|judge|model|protocol)\\.ts$|domain/)' },
    },
    {
      name: 'inference-dans-le-worker',
      severity: 'error',
      comment:
        'Le moteur d’inférence n’est importé que par le fil d’exécution du moteur (et son client, pour l’URL du binaire).',
      from: { pathNot: '^(src/engine/(worker|client)\\.ts|tests/)' },
      to: { path: 'onnxruntime-web' },
    },
    {
      name: 'physique-en-un-seul-module',
      severity: 'error',
      comment: 'Le moteur physique n’est importé que par src/scene/physics.ts.',
      from: { pathNot: '^src/scene/physics\\.ts$' },
      to: { path: '@dimforge/rapier3d' },
    },
    {
      name: 'etat-sans-vue',
      severity: 'error',
      comment: 'L’état ne dépend ni de la scène, ni de l’interface, ni de la lecture.',
      from: { path: '^src/state/' },
      to: { path: '^src/(scene|ui|replay)/' },
    },
    {
      name: 'scene-et-interface-separees',
      severity: 'error',
      comment: 'La scène 3D et l’interface ne se connaissent pas : elles se parlent par l’état.',
      from: { path: '^src/scene/' },
      to: { path: '^src/ui/' },
    },
    {
      name: 'interface-sans-scene',
      severity: 'error',
      comment: 'L’interface n’importe pas la scène 3D.',
      from: { path: '^src/ui/' },
      to: { path: '^src/scene/' },
    },
    {
      name: 'three-dans-la-scene',
      severity: 'error',
      comment: 'three.js et ses liaisons React ne sont utilisés que par la scène.',
      from: { pathNot: '^src/scene/' },
      to: { path: '^node_modules/(\\.pnpm/)?(three|@react-three)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.mjs'] },
  },
};
