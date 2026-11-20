export const VARIATION_STEP_MS = 230;

/** Rattrape un rendu lent sans franchir le dernier coup calculé de la branche. */
export function nextVariationStep(step: number, available: number, due: number, now: number) {
  const elapsedSteps = 1 + Math.floor(Math.max(0, now - due) / VARIATION_STEP_MS);
  const next = Math.min(available, step === 0 ? 1 : step + elapsedSteps);
  // Le premier coup garde son temps à l’écran. Au bout du préfixe, l’horloge
  // repartira au moment où le moteur livrera la suite ou la branche suivante.
  const nextDue =
    next === 1 || next === available ? undefined : due + elapsedSteps * VARIATION_STEP_MS;
  return { step: next, nextDue };
}
