import { opposite, PASS, POINTS } from '../domain/board.ts';
import { threatOf, type Move } from '../domain/game.ts';
import { afterCandidate } from '../engine/analysis.ts';
import type { EnginePosition } from '../engine/features.ts';
import { isLegalZeroMove, type ZeroResult } from '../engine/zeroSearch.ts';

type Search = (
  position: EnginePosition,
  options: { signal: AbortSignal; visits?: number; exclude?: number[] },
) => Promise<ZeroResult>;

export interface ZeroReadingStep {
  move: Move;
  blackWin?: number;
  choices: ZeroResult['choices'];
  threat: ReturnType<typeof threatOf>;
}

export interface SimulationLine {
  /** Autres choix déjà visités à la même racine et avec les mêmes exclusions. */
  rootChoices?: ZeroResult['choices'];
  /** Fin déjà calculée de la variante principale, au-delà du dernier coup affiché. */
  pending?: number[];
  complete?: boolean;
  excluded?: number[];
  moves: Move[];
  blackWin?: number;
}

/** Chaque position fait l’objet d’une nouvelle recherche, y compris après une bifurcation. */
export async function readZeroLine(
  search: Search,
  start: EnginePosition,
  options: {
    limit: number;
    first?: number;
    visits?: number;
    signal: AbortSignal;
    onStep: (step: ZeroReadingStep) => void;
  },
) {
  let position = start;
  const { signal } = options;
  for (let i = 0; i < options.limit && !signal.aborted; i++) {
    const { choices } = await search(position, { signal, visits: options.visits });
    if (signal.aborted || !choices.length) return;
    const point = (i === 0 ? options.first : undefined) ?? choices[0]!.point;
    const selected = choices.find((choice) => choice.point === point);
    if (!selected && !isLegalZeroMove(position, point))
      throw new Error('Coup interdit dans cette position');
    const move = { color: position.next, point };
    const previous = position.moves.at(-1);
    position = afterCandidate(position, point);
    options.onStep({
      move,
      blackWin: selected?.blackWin,
      choices,
      threat: threatOf(position.setupBlack, position.moves, position.moves.length),
    });
    if (point === PASS && previous?.point === PASS) return;
  }
}

export const PREVIEW_BRANCHES = 10;
export const PREVIEW_DEPTH = 20;

/** Prolonge le préfixe réellement lu. La suite non affichée d’une recherche reste disponible. */
export async function extendZeroLine(
  search: Search,
  start: EnginePosition,
  line: SimulationLine,
  depth: number,
  signal: AbortSignal,
  onUpdate: (line: SimulationLine) => void,
): Promise<SimulationLine> {
  if (!Number.isSafeInteger(depth) || depth < 1)
    throw new RangeError('Profondeur de lecture invalide');
  if (line.complete || signal.aborted || line.moves.length >= depth) return line;
  const last = line.moves.at(-1);
  let position = last
    ? { ...start, next: opposite(last.color), moves: [...start.moves, ...line.moves] }
    : start;
  let current = line;
  while (current.moves.length < depth && !signal.aborted) {
    if (position.moves.at(-1)?.point === PASS && position.moves.at(-2)?.point === PASS) {
      current = { ...current, complete: true };
      onUpdate(current);
      break;
    }
    const continuation = current.pending?.length
      ? current.pending
      : ((await search(position, { signal })).choices[0]?.line ?? []);
    if (signal.aborted) break;
    const added: Move[] = [];
    let next = position.next;
    let previous = position.moves.at(-1)?.point;
    let complete = continuation.length === 0;
    for (const point of continuation) {
      added.push({ color: next, point });
      next = opposite(next);
      complete = point === PASS && previous === PASS;
      if (complete || current.moves.length + added.length === depth) break;
      previous = point;
    }
    current = {
      ...current,
      moves: [...current.moves, ...added],
      pending: complete ? [] : continuation.slice(added.length),
      complete,
    };
    onUpdate(current);
    if (complete) break;
    position = { ...position, moves: [...position.moves, ...added], next };
  }
  return current;
}

/** Montre les branches dans l’ordre des visites, puis exclut les premiers coups déjà étudiés. */
export async function previewZeroLines(
  search: Search,
  start: EnginePosition,
  signal: AbortSignal,
  onLine: (line: SimulationLine, index: number) => void,
  {
    branches = PREVIEW_BRANCHES,
    depth = PREVIEW_DEPTH,
    existing = [],
  }: {
    branches?: number;
    depth?: number;
    existing?: readonly SimulationLine[];
  } = {},
): Promise<SimulationLine[]> {
  if (!Number.isSafeInteger(branches) || branches < 1)
    throw new RangeError('Nombre de variantes invalide');
  if (!Number.isSafeInteger(depth) || depth < 1)
    throw new RangeError('Profondeur de lecture invalide');
  const target = Math.min(POINTS + 1, branches);
  const lines = [...existing];
  const shown = new Set(
    existing.flatMap((line) => line.moves.slice(0, 1).map((move) => move.point)),
  );
  const last = existing.at(-1);
  let cached = last?.rootChoices;
  while (lines.length < target && !signal.aborted) {
    const excluded = cached ? (last?.excluded ?? []) : [...shown];
    const choices =
      cached ??
      (await search(start, excluded.length ? { signal, exclude: excluded } : { signal })).choices;
    const available = choices.filter(
      (choice) => !shown.has(choice.point) && choice.line.length > 0,
    );
    if (signal.aborted || (!cached && !available.length)) break;
    cached = undefined;
    for (const branch of available) {
      const index = lines.length;
      const source: SimulationLine = {
        blackWin: branch.blackWin,
        excluded,
        moves: [],
        rootChoices: choices,
        pending: branch.line,
      };
      const line = await extendZeroLine(search, start, source, depth, signal, (update) =>
        onLine(update, index),
      );
      if (signal.aborted) return [...existing];
      lines.push(line);
      shown.add(branch.point);
      if (lines.length === target) break;
    }
  }
  return signal.aborted ? [...existing] : lines;
}

const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export function blackWinLabel(blackWin: number): string {
  return `Chances de Noir · ${percent.format(blackWin)}`;
}
