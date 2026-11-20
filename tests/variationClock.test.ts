import { describe, expect, it } from 'vitest';
import { nextVariationStep, VARIATION_STEP_MS as frame } from '../src/replay/variationClock.ts';

describe('cadence des variantes', () => {
  it('montre le premier coup même quand le rendu a manqué plusieurs échéances', () => {
    expect(nextVariationStep(0, 20, frame, 8 * frame)).toEqual({ step: 1, nextDue: undefined });
  });

  it('conserve la cadence même si les calculs et le rendu retardent chaque image', () => {
    const due = 2 * frame;
    expect(nextVariationStep(1, 20, due, due)).toEqual({ step: 2, nextDue: 3 * frame });
    expect(nextVariationStep(2, 20, 3 * frame, 10 * frame + 1)).toEqual({
      step: 10,
      nextDue: 11 * frame,
    });
  });

  it('maintient le dernier coup disponible et ne reporte pas le retard sur la suite', () => {
    expect(nextVariationStep(2, 5, frame, 100 * frame)).toEqual({ step: 5, nextDue: undefined });
    const restart = 200 * frame;
    expect(nextVariationStep(5, 20, restart, restart)).toEqual({
      step: 6,
      nextDue: restart + frame,
    });
    expect(nextVariationStep(18, 20, frame, 10 * frame)).toEqual({ step: 20, nextDue: undefined });
  });
});
