import { opposite, PASS, POINTS } from '../domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord, type Move } from '../domain/game.ts';
import { afterCandidate } from '../engine/analysis.ts';
import type { EnginePosition } from '../engine/features.ts';
import type { Evaluator } from '../engine/judge.ts';
import { isLegalZeroMove } from '../engine/zeroSearch.ts';
import { scoreMoveKey, VariationScoreCache } from './variationScores.ts';
import { PREVIEW_BRANCHES, PREVIEW_DEPTH } from './zeroReading.ts';

export interface StudyRow {
  point: number;
  reply: number | null;
  horizon: 1 | 2;
  recorded: boolean;
  /** Avance estimée du joueur au trait à la racine, après la réplique éventuelle. */
  lead: number;
  /** Différence avec l’avance estimée après la réplique au coup du kifu. */
  delta: number | null;
}

function ended(moves: readonly Move[]) {
  return moves.at(-1)?.point === PASS && moves.at(-2)?.point === PASS;
}

export function studyStart(game: GameRecord, base: number) {
  const index = Math.min(game.moves.length / 3, Math.max(0, Math.trunc(base)));
  const moves = decodeMoves(game.moves.slice(0, (index + 1) * 3));
  const recorded = moves.length > index ? moves.pop() : undefined;
  const previous = moves.at(-1);
  const position: EnginePosition = {
    setupBlack: decodePoints(game.setupBlack),
    komi: game.komi,
    moves,
    next: recorded?.color ?? (previous ? opposite(previous.color) : game.handicap ? 'W' : 'B'),
  };
  return { position, recorded: recorded?.point };
}

/** Une racine et son komi, communs au classement court et aux prolongements à la demande. */
export class StudyLines {
  private readonly scores: VariationScoreCache;
  private readonly lines = new Map<number, Move[]>();
  private readonly estimates = new Map<number, Omit<StudyRow, 'delta'>>();
  readonly position: EnginePosition;
  readonly recorded: number | undefined;
  readonly finished: boolean;
  ranked = false;

  constructor(position: EnginePosition, recorded: number | undefined, evaluate: Evaluator) {
    this.position = position;
    this.recorded = recorded;
    this.finished = ended(position.moves);
    this.scores = new VariationScoreCache(position, evaluate, POINTS + 1);
  }

  rows(): StudyRow[] {
    const reference = this.recorded === undefined ? undefined : this.estimates.get(this.recorded);
    return [...this.estimates.values()]
      .map((row) => ({ ...row, delta: reference ? row.lead - reference.lead : null }))
      .sort((a, b) => b.lead - a.lead);
  }

  line(point: number): Move[] {
    return this.lines.get(point) ?? [];
  }

  complete(point: number): boolean {
    const line = this.line(point);
    return (
      this.finished ||
      line.length >= PREVIEW_DEPTH ||
      ended([...this.position.moves.slice(-1), ...line])
    );
  }

  clearErrors() {
    this.scores.clearErrors();
  }

  private async score(path: string, signal: AbortSignal) {
    signal.throwIfAborted();
    await this.scores.fill([path], signal);
    signal.throwIfAborted();
    const score = this.scores.at(path);
    if (!score) throw new Error(this.scores.error(path) || 'Score indisponible à cette position.');
    return score;
  }

  async rank(signal: AbortSignal, update: () => void) {
    if (this.finished || this.ranked) return;
    await this.score('', signal);
    const openings = new Set<number>();
    if (this.recorded !== undefined && isLegalZeroMove(this.position, this.recorded))
      openings.add(this.recorded);
    for (const point of this.scores.suggested('') ?? []) {
      if (isLegalZeroMove(this.position, point)) openings.add(point);
      if (openings.size >= PREVIEW_BRANCHES) break;
    }
    if (!openings.size) throw new Error('Aucun premier coup légal proposé.');
    for (const point of openings) {
      if (this.estimates.has(point)) continue;
      const moves = await this.extend(point, 2, signal);
      const path = moves.map(scoreMoveKey).join('');
      const score = await this.score(path, signal);
      const reply = moves[1];
      this.estimates.set(point, {
        point,
        recorded: point === this.recorded,
        reply: reply?.point ?? null,
        horizon: reply ? 2 : 1,
        lead: this.position.next === 'B' ? score.blackLead : -score.blackLead,
      });
      update();
    }
    this.ranked = true;
    update();
  }

  async read(point: number, signal: AbortSignal, update: () => void) {
    if (!this.finished) await this.extend(point, PREVIEW_DEPTH, signal, update);
  }

  private async extend(point: number, limit: number, signal: AbortSignal, update?: () => void) {
    signal.throwIfAborted();
    let moves = this.lines.get(point)?.slice(0, limit);
    if (!moves) {
      if (!isLegalZeroMove(this.position, point))
        throw new Error('Premier coup illégal dans cette position.');
      moves = [{ color: this.position.next, point }];
      this.lines.set(point, moves);
      update?.();
    }
    let path = moves.map(scoreMoveKey).join('');
    let position = {
      ...this.position,
      moves: [...this.position.moves, ...moves],
      next: opposite(moves.at(-1)!.color),
    };
    while (moves.length < limit && !ended(position.moves)) {
      await this.score(path, signal);
      const next = this.scores.suggested(path)?.find((p) => isLegalZeroMove(position, p));
      if (next === undefined) throw new Error('Aucune continuation légale proposée.');
      const move = { color: position.next, point: next };
      moves = [...moves, move];
      path += scoreMoveKey(move);
      position = afterCandidate(position, next);
      // Classement et lecture peuvent demander le même préfixe simultanément.
      if (moves.length > this.line(point).length) {
        this.lines.set(point, moves);
        update?.();
      }
    }
    return moves;
  }
}
