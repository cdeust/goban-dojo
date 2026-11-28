import { analyzeZero, loadZeroEngine, useZeroEngine } from '../../src/engine/zeroClient.ts';
import { evaluate, loadEngine, useEngine } from '../../src/engine/client.ts';
import { afterCandidate } from '../../src/engine/analysis.ts';
import { isLegalZeroMove } from '../../src/engine/zeroSearch.ts';
import { pointToHuman } from '../../src/domain/board.ts';
import type { Move } from '../../src/domain/game.ts';
import type { EnginePosition } from '../../src/engine/features.ts';

interface BenchmarkInput {
  position: EnginePosition;
  move: Move;
  number: number;
  visits: number;
}
export interface BenchmarkRow {
  move: number;
  color: Move['color'];
  played: string;
  ai: string;
  same: boolean;
  visits: number;
  aiVisits: number;
  playedLead: number;
  aiLead: number;
  delta: number;
  winrateDelta: number;
  ms: number;
}
async function ready(): Promise<void> {
  loadEngine();
  loadZeroEngine();
  const start = performance.now();
  while (performance.now() - start < 60_000) {
    const judge = useEngine.getState(),
      player = useZeroEngine.getState();
    if (judge.status === 'ready' && player.status === 'ready') return;
    if (judge.status === 'failed' || player.status === 'failed')
      throw new Error(judge.error ?? player.error ?? 'Moteur indisponible');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chargement des modèles expiré');
}
async function compare({ position, move, number, visits }: BenchmarkInput): Promise<BenchmarkRow> {
  const start = performance.now();
  const result = await analyzeZero(position, { visits });
  if (result.visits !== visits) throw new Error('Budget de recherche incomplet');
  const selected = result.choices.find((candidate) => isLegalZeroMove(position, candidate.point));
  if (!selected) throw new Error('Aucun candidat légal de Leela Zero');
  const same = selected.point === move.point;
  const siblings = same
    ? [afterCandidate(position, move.point)]
    : [afterCandidate(position, move.point), afterCandidate(position, selected.point)];
  const evaluations = await evaluate(siblings);
  const historical = evaluations[0],
    ai = evaluations[same ? 0 : 1];
  if (!historical || !ai) throw new Error('Évaluation incomplète');
  const sign = move.color === 'B' ? 1 : -1;
  return {
    move: number,
    color: move.color,
    played: pointToHuman(move.point),
    ai: pointToHuman(selected.point),
    same,
    visits: result.visits,
    aiVisits: selected.visits,
    playedLead: sign * historical.blackLead,
    aiLead: sign * ai.blackLead,
    delta: sign * (ai.blackLead - historical.blackLead),
    winrateDelta: sign * (ai.blackWinrate - historical.blackWinrate),
    ms: Math.round(performance.now() - start),
  };
}
declare global {
  interface Window {
    dojoBenchmark?: { ready: typeof ready; compare: typeof compare };
  }
}
window.dojoBenchmark = { ready, compare };
