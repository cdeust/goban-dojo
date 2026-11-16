/**
 * Règles du go nécessaires à la relecture d'une partie : pose, capture,
 * détection du suicide et du ko simple. Goban 19×19 uniquement.
 *
 * Un point est un entier p = y * 19 + x, avec x de gauche à droite et
 * y de haut en bas (convention SGF : « aa » = coin supérieur gauche).
 */

export const SIZE = 19;
export const POINTS = SIZE * SIZE;
export const PASS = -1;

export type Color = 'B' | 'W';

export const opposite = (c: Color): Color => (c === 'B' ? 'W' : 'B');

export function pointFromSgf(coord: string): number {
  if (coord === '' || coord === 'tt') return PASS;
  if (coord.length !== 2) throw new RangeError(`coordonnée SGF invalide : « ${coord} »`);
  const x = coord.charCodeAt(0) - 97;
  const y = coord.charCodeAt(1) - 97;
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) {
    throw new RangeError(`coordonnée SGF hors du goban : « ${coord} »`);
  }
  return y * SIZE + x;
}

export function pointToSgf(p: number): string {
  if (p === PASS) return '';
  return String.fromCharCode(97 + (p % SIZE)) + String.fromCharCode(97 + Math.floor(p / SIZE));
}

/** Notation usuelle des kifus occidentaux : colonnes A–T sans I, lignes 1–19 depuis le bas. */
export function pointToHuman(p: number): string {
  if (p === PASS) return 'passe';
  const x = p % SIZE;
  const y = Math.floor(p / SIZE);
  return 'ABCDEFGHJKLMNOPQRST'.charAt(x) + String(SIZE - y);
}

const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: POINTS }, (_, p) => {
  const x = p % SIZE;
  const y = Math.floor(p / SIZE);
  const out: number[] = [];
  if (x > 0) out.push(p - 1);
  if (x < SIZE - 1) out.push(p + 1);
  if (y > 0) out.push(p - SIZE);
  if (y < SIZE - 1) out.push(p + SIZE);
  return out;
});

export const neighbours = (p: number): readonly number[] => NEIGHBOURS[p] ?? [];

const EMPTY = 0;
const code = (c: Color): number => (c === 'B' ? 1 : 2);

export type IllegalReason = 'occupied' | 'suicide' | 'ko';

export interface PlayResult {
  /** Points des pierres adverses capturées par ce coup. */
  captures: number[];
  /** Renseigné si le coup enfreint une règle ; il est tout de même joué (fidélité au kifu). */
  illegal?: IllegalReason;
}

export class Board {
  private readonly cells = new Uint8Array(POINTS);
  /** Point interdit par la règle du ko pour le prochain coup, ou -1. */
  private koPoint = -1;

  get(p: number): Color | null {
    const v = this.cells[p];
    return v === 1 ? 'B' : v === 2 ? 'W' : null;
  }

  /** Pose une pierre de mise en place (handicap) sans appliquer les règles. */
  setup(p: number, color: Color | null): void {
    this.cells[p] = color ? code(color) : EMPTY;
  }

  /** Renvoie le groupe contenant p et indique s'il possède au moins une liberté. */
  private group(p: number): { stones: number[]; hasLiberty: boolean } {
    const colour = this.cells[p];
    const stones: number[] = [p];
    const seen = new Uint8Array(POINTS);
    seen[p] = 1;
    let hasLiberty = false;
    for (let i = 0; i < stones.length; i++) {
      for (const q of neighbours(stones[i] as number)) {
        if (seen[q]) continue;
        const v = this.cells[q];
        if (v === EMPTY) hasLiberty = true;
        else if (v === colour) {
          seen[q] = 1;
          stones.push(q);
        }
      }
    }
    return { stones, hasLiberty };
  }

  play(color: Color, p: number): PlayResult {
    if (p === PASS) {
      this.koPoint = -1;
      return { captures: [] };
    }
    let illegal: IllegalReason | undefined;
    if (this.cells[p] !== EMPTY) illegal = 'occupied';
    else if (p === this.koPoint) illegal = 'ko';

    this.cells[p] = code(color);
    const enemy = code(opposite(color));
    const captures: number[] = [];
    for (const q of neighbours(p)) {
      if (this.cells[q] !== enemy) continue;
      const g = this.group(q);
      if (!g.hasLiberty) {
        for (const s of g.stones) {
          this.cells[s] = EMPTY;
          captures.push(s);
        }
      }
    }
    const own = this.group(p);
    if (captures.length === 0 && !own.hasLiberty) {
      // Suicide : interdit par les règles japonaises. On retire le groupe pour garder
      // un goban cohérent, et on signale l'anomalie.
      illegal ??= 'suicide';
      for (const s of own.stones) this.cells[s] = EMPTY;
    }
    // Ko simple : une seule pierre capturée par une pierre isolée n'ayant qu'une liberté.
    this.koPoint =
      captures.length === 1 && own.stones.length === 1 && this.libertyCount(p) === 1
        ? (captures[0] as number)
        : -1;
    return illegal ? { captures, illegal } : { captures };
  }

  private libertyCount(p: number): number {
    if (this.cells[p] === EMPTY) return 0;
    const g = this.group(p);
    const libs = new Set<number>();
    for (const s of g.stones)
      for (const q of neighbours(s)) if (this.cells[q] === EMPTY) libs.add(q);
    return libs.size;
  }
}
