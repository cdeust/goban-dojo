import type { Move } from '../domain/game.ts';
import { candidatesOf } from './analysis.ts';
import type { EnginePosition } from './features.ts';
import type { Evaluator } from './judge.ts';
import { readLine } from './reading.ts';

// Trois branches distinctes, assez courtes pour une lecture à l'écran. La lecture longue
// reste accessible depuis la même position pour prolonger les recherches.
const PREVIEW_LINES = 3;
const PREVIEW_DEPTH = 8;

export interface PreviewLine {
  moves: Move[];
  estimates: number[];
}

export async function previewLines(
  evaluate: Evaluator,
  position: EnginePosition,
  recorded: Move,
  signal: AbortSignal,
  onLine: (line: PreviewLine, index: number) => void,
): Promise<PreviewLine[]> {
  const [root] = await evaluate([position]);
  if (signal.aborted || !root) return [];
  const candidates = candidatesOf(position, root.policy)
    .filter(({ point }) => point !== recorded.point)
    .slice(0, PREVIEW_LINES);

  const lines: PreviewLine[] = [];
  // Le worker utilise un seul fil. Arrêter entre branches évite d'empiler les requêtes
  // lorsqu'on quitte la position ou qu'on révèle le coup pendant le calcul.
  for (const { point } of candidates) {
    if (signal.aborted) return [];
    const line: PreviewLine = { moves: [], estimates: [] };
    await readLine(evaluate, position, {
      first: point,
      limit: PREVIEW_DEPTH,
      signal,
      onStep: ({ move, blackLead }) => {
        line.moves.push(move);
        line.estimates.push(blackLead);
        if (line.moves.length === 2)
          onLine({ moves: line.moves.slice(), estimates: line.estimates.slice() }, lines.length);
      },
    });
    if (!signal.aborted && line.moves.length) {
      lines.push(line);
      onLine(line, lines.length - 1);
    }
  }
  return signal.aborted ? [] : lines;
}
