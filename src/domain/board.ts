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
// Les trois codes d'occupation (0, 1, 2) occupent chacun un octet UTF-8.
const cellDecoder = new TextDecoder();
const code = (c: Color): number => (c === 'B' ? 1 : 2);

// Les positions reçues du worker traversent une frontière JavaScript non typée.
function boardIndex(point: unknown): number {
  if (typeof point === 'number' && point >= 0 && point < POINTS) {
    const index = Math.floor(point);
    if (index === point) return index;
  }
  throw new RangeError('Intersection du goban invalide');
}

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

  /** Copie indépendante du goban et de son interdiction de ko. */
  clone(): Board {
    const copy = new Board();
    copy.cells.set(this.cells);
    copy.koPoint = this.koPoint;
    return copy;
  }

  /** Identité exacte de l’occupation pour la règle de superko positionnel. */
  positionKey(): string {
    return cellDecoder.decode(this.cells);
  }

  get(point: number): Color | null {
    if (point === PASS) return null;
    const v = this.cells[boardIndex(point)];
    return v === 1 ? 'B' : v === 2 ? 'W' : null;
  }

  /** Pose une pierre de mise en place (handicap) sans appliquer les règles. */
  setup(point: number, color: Color | null): void {
    this.cells[boardIndex(point)] = color ? code(color) : EMPTY;
  }

  /** Pierres du groupe qui occupe p (vide si le point est libre). */
  stonesOf(point: number): number[] {
    if (point === PASS) return [];
    const p = boardIndex(point);
    return this.cells[p] === EMPTY ? [] : this.group(p).stones;
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

  play(color: Color, point: number): PlayResult {
    if (point === PASS) {
      this.koPoint = -1;
      return { captures: [] };
    }
    const p = boardIndex(point);
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

  /** Nombre de libertés du groupe qui occupe p (0 si le point est vide). */
  libertyCount(point: number): number {
    if (point === PASS) return 0;
    const p = boardIndex(point);
    if (this.cells[p] === EMPTY) return 0;
    const g = this.group(p);
    const libs = new Set<number>();
    for (const s of g.stones)
      for (const q of neighbours(s)) if (this.cells[q] === EMPTY) libs.add(q);
    return libs.size;
  }
}
