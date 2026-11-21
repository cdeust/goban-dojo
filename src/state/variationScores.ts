import { opposite, PASS, pointToSgf, type Color } from '../domain/board.ts';
import { decodeMoves, type Move } from '../domain/game.ts';
import { rankedLegalPoints } from '../engine/decode.ts';
import type { EnginePosition } from '../engine/features.ts';
import { CANDIDATES, type Evaluator } from '../engine/judge.ts';

export interface PositionScore {
  blackLead: number;
  evenKomi: number;
}

export interface MoveScore extends PositionScore {
  /** Variation de l'avance estimée du joueur qui vient de jouer. */
  gain: number;
}

/** Le même format de triplets que les coups du kifu, y compris pour une passe. */
export function scoreMoveKey({ color, point }: Move): string {
  return color.toLowerCase() + (pointToSgf(point) || '--');
}

/** Une seule racine conserve son historique, son handicap, son joueur au trait et son komi. */
export class VariationScoreCache {
  private readonly leads = new Map<string, PositionScore>();
  private readonly candidates = new Map<string, number[]>();
  private readonly failures = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private active?: Promise<void>;
  private version = 0;
  private readonly position: EnginePosition;
  private readonly evaluate: Evaluator;

  private readonly candidateLimit: number;

  constructor(position: EnginePosition, evaluate: Evaluator, candidateLimit = CANDIDATES) {
    this.candidateLimit = candidateLimit;
    this.position = position;
    this.evaluate = evaluate;
  }

  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => this.listeners.delete(notify);
  };

  snapshot = () => this.version;

  private publish() {
    this.version++;
    for (const notify of this.listeners) notify();
  }

  at(path: string): PositionScore | undefined {
    return this.leads.get(path);
  }

  afterMove(path: string): MoveScore | undefined {
    if (!path) return undefined;
    const before = this.at(path.slice(0, -3));
    const after = this.at(path);
    if (!before || !after) return undefined;
    const mover: Color = path.at(-3) === 'b' ? 'B' : 'W';
    return { ...after, gain: (after.blackLead - before.blackLead) * (mover === 'B' ? 1 : -1) };
  }

  suggested(path: string): readonly number[] | undefined {
    return this.candidates.get(path);
  }

  error(path: string) {
    return this.failures.get(path);
  }

  clearErrors() {
    this.failures.clear();
    this.publish();
  }

  /** Une inférence à la fois. Un curseur déplacé abandonne la file entre deux positions. */
  async fill(paths: Iterable<string>, signal: AbortSignal) {
    for (const path of paths) {
      while (this.active && !signal.aborted) await this.active;
      if (signal.aborted) return;
      if (this.leads.has(path) || this.failures.has(path)) continue;
      this.active = this.infer(path).finally(() => {
        this.active = undefined;
        this.publish();
      });
      await this.active;
    }
  }

  private async infer(path: string) {
    try {
      const prefix = decodeMoves(path);
      const last = prefix.at(-1);
      const position = last
        ? {
            ...this.position,
            moves: [...this.position.moves, ...prefix],
            next: opposite(last.color),
          }
        : this.position;
      const [result] = await this.evaluate([position]);
      if (!result || !Number.isFinite(result.blackLead))
        throw new Error('Avance estimée indisponible');
      this.candidates.set(
        path,
        position.moves.at(-1)?.point === PASS && position.moves.at(-2)?.point === PASS
          ? []
          : rankedLegalPoints(result.policy).slice(0, this.candidateLimit),
      );
      // KataGo définit le lead comme la compensation en points qui équilibrerait la position.
      this.leads.set(path, {
        blackLead: result.blackLead,
        evenKomi: (position.komi ?? 0) + result.blackLead,
      });
    } catch (error) {
      this.failures.set(path, error instanceof Error ? error.message : String(error));
    }
  }
}
