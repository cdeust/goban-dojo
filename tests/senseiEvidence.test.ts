import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import evidence from '../src/story/senseiEvidence.json';
import { MODEL } from '../src/engine/model.ts';
import { ZERO_MODEL } from '../src/engine/zeroModel.ts';

interface Row {
  move: number;
  same: boolean;
  visits: number;
  delta: number;
  winrateDelta: number;
  playedLead: number;
  aiLead: number;
}
const bytes = readFileSync(new URL('../docs/benchmarks/hon-2025-1.ndjson', import.meta.url));
const rows = bytes
  .toString('utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as Row);
describe('preuve publiée : benchmark Sensei', () => {
  it('la synthèse correspond intégralement aux données de 152 positions à budget égal', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(evidence.resultSha256);
    expect(rows).toHaveLength(152);
    expect(rows.map((r) => r.move)).toEqual(Array.from({ length: 152 }, (_, i) => i + 1));
    expect(rows.every((r) => r.visits === evidence.visits && Number.isFinite(r.delta))).toBe(true);
    expect(rows.every((r) => Math.abs(r.aiLead - r.playedLead - r.delta) < 1e-8)).toBe(true);
    expect(rows.filter((r) => r.same).every((r) => r.delta === 0)).toBe(true);
    expect(evidence.same).toBe(rows.filter((r) => r.same).length);
    expect(evidence.gainAtLeast2).toBe(rows.filter((r) => r.delta >= 2).length);
    expect(evidence.lossAtLeast2).toBe(rows.filter((r) => r.delta <= -2).length);
    expect(evidence.within2).toBe(rows.filter((r) => Math.abs(r.delta) < 2).length);
    expect(evidence.meanDelta).toBeCloseTo(
      rows.reduce((sum, r) => sum + r.delta, 0) / rows.length,
      10,
    );
    expect(evidence.meanWinrateDelta).toBeCloseTo(
      rows.reduce((sum, r) => sum + r.winrateDelta, 0) / rows.length,
      10,
    );
    expect(evidence.playerSha256).toBe(ZERO_MODEL.sha256);
    expect(evidence.judgeSha256).toBe(MODEL.sha256);
  });
});
