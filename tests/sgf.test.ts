import { describe, expect, it } from 'vitest';
import { MAX_SGF_LENGTH, SgfSyntaxError, mainLine, parseSgf, prop } from '../src/domain/sgf.ts';

describe('parseSgf', () => {
  it('lit les propriétés de la racine et la suite des coups', () => {
    const root = parseSgf('(;FF[4]SZ[19]PB[Yasuda Shusaku]PW[Ota Yuzo];B[qd];W[dc];B[pq])');
    expect(prop(root, 'PB')).toBe('Yasuda Shusaku');
    const line = mainLine(root);
    expect(line).toHaveLength(4);
    expect(line.slice(1).map((n) => prop(n, 'B') ?? prop(n, 'W'))).toEqual(['qd', 'dc', 'pq']);
  });

  it('suit la première variante comme ligne principale', () => {
    const root = parseSgf('(;SZ[19];B[aa](;W[bb];B[cc])(;W[dd]))');
    expect(mainLine(root).map((n) => prop(n, 'B') ?? prop(n, 'W'))).toEqual([
      undefined,
      'aa',
      'bb',
      'cc',
    ]);
  });

  it('gère les échappements et les valeurs multiples', () => {
    const root = parseSgf('(;C[a\\]b\\\\c]AB[dd][pp][dp])');
    expect(prop(root, 'C')).toBe('a]b\\c');
    expect(root.props.get('AB')).toEqual(['dd', 'pp', 'dp']);
  });

  it('accepte une passe (valeur vide)', () => {
    const root = parseSgf('(;SZ[19];B[];W[tt])');
    expect(mainLine(root).map((n) => prop(n, 'B') ?? prop(n, 'W'))).toEqual([undefined, '', 'tt']);
  });

  it('rejette les entrées mal formées', () => {
    expect(() => parseSgf('')).toThrow(SgfSyntaxError);
    expect(() => parseSgf(';B[aa]')).toThrow(SgfSyntaxError);
    expect(() => parseSgf('(;B[aa')).toThrow(SgfSyntaxError);
    expect(() => parseSgf('(;B)')).toThrow(SgfSyntaxError);
  });

  it('rejette un fichier démesuré', () => {
    expect(() => parseSgf(`(;C[${'x'.repeat(MAX_SGF_LENGTH)}])`)).toThrow(SgfSyntaxError);
  });

  it("ne déborde pas la pile sur une très longue partie ou d'innombrables variantes", () => {
    const long = `(;SZ[19]${';B[aa];W[bb]'.repeat(15000)})`;
    expect(mainLine(parseSgf(long))).toHaveLength(30001);
    const nested = `${'(;B[aa]'.repeat(20000)}${')'.repeat(20000)}`;
    expect(mainLine(parseSgf(nested))).toHaveLength(20000);
  });
});
