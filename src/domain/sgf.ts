/**
 * Analyseur SGF (Smart Game Format, FF[4]) minimal et strict.
 * Référence : https://www.red-bean.com/sgf/sgf4.html
 *
 * Ne dépend de rien : utilisé à la fois par le pipeline de données (Node)
 * et par les tests.
 */

export interface SgfNode {
  props: Map<string, string[]>;
  children: SgfNode[];
}

export class SgfSyntaxError extends Error {}

/** Taille maximale acceptée pour un fichier SGF (défense contre les entrées hostiles). */
export const MAX_SGF_LENGTH = 512 * 1024;

export function parseSgf(text: string, { strict = false } = {}): SgfNode {
  if (text.length > MAX_SGF_LENGTH) throw new SgfSyntaxError('fichier SGF trop volumineux');
  let i = 0;
  const n = text.length;

  const skipWs = (): void => {
    while (i < n && /\s/.test(text.charAt(i))) i++;
  };

  const parseValue = (): string => {
    // text[i] === '['
    i++;
    let out = '';
    while (i < n) {
      const c = text.charAt(i);
      if (c === '\\') {
        const next = text.charAt(i + 1);
        // « soft line break » : antislash + saut de ligne = rien
        if (next === '\n' || next === '\r') {
          i += 2;
          if ((text.charAt(i) === '\n' || text.charAt(i) === '\r') && text.charAt(i) !== next) i++;
        } else {
          out += next;
          i += 2;
        }
      } else if (c === ']') {
        i++;
        return out;
      } else {
        out += c;
        i++;
      }
    }
    throw new SgfSyntaxError('valeur de propriété non terminée');
  };

  const parseNode = (): SgfNode => {
    // text[i] === ';'
    i++;
    const props = new Map<string, string[]>();
    for (;;) {
      skipWs();
      let ident = '';
      while (i < n && /[A-Za-z]/.test(text.charAt(i))) {
        const c = text.charAt(i);
        // FF[3] tolérait des minuscules dans les identifiants : on ne garde que les majuscules.
        if (c >= 'A' && c <= 'Z') ident += c;
        i++;
      }
      if (ident === '') break;
      skipWs();
      const values: string[] = [];
      while (text.charAt(i) === '[') {
        values.push(parseValue());
        skipWs();
      }
      if (values.length === 0) throw new SgfSyntaxError(`propriété ${ident} sans valeur`);
      const existing = props.get(ident);
      if (existing) existing.push(...values);
      else props.set(ident, values);
    }
    return { props, children: [] };
  };

  // Analyse itérative (pas de récursion : une partie = une longue chaîne de nœuds).
  const parseTree = (): SgfNode => {
    skipWs();
    if (text.charAt(i) !== '(') throw new SgfSyntaxError("'(' attendu");
    let root: SgfNode | null = null;
    // Pile des points de branchement : le nœud auquel rattacher la prochaine séquence.
    const stack: (SgfNode | null)[] = [];
    let current: SgfNode | null = null;
    while (i < n) {
      skipWs();
      const c = text.charAt(i);
      if (c === '(') {
        stack.push(current);
        i++;
      } else if (c === ')') {
        current = stack.pop() ?? null;
        i++;
        if (stack.length === 0) break;
      } else if (c === ';') {
        const node = parseNode();
        if (current) current.children.push(node);
        else if (!root) root = node;
        else throw new SgfSyntaxError('plusieurs racines');
        current = node;
      } else if (c === '') {
        break;
      } else {
        throw new SgfSyntaxError(`caractère inattendu « ${c} » à la position ${i}`);
      }
    }
    if (strict && stack.length !== 0) throw new SgfSyntaxError('arbre SGF incomplet');
    if (!root) throw new SgfSyntaxError('arbre vide');
    skipWs();
    if (strict && i !== n)
      throw new SgfSyntaxError('Choisissez un fichier contenant une seule partie.');
    return root;
  };

  return parseTree();
}

/** Ligne principale : on suit toujours la première variante. */
export function mainLine(root: SgfNode): SgfNode[] {
  const line: SgfNode[] = [];
  let node: SgfNode | undefined = root;
  while (node) {
    line.push(node);
    node = node.children[0];
  }
  return line;
}

export function prop(node: SgfNode, id: string): string | undefined {
  return node.props.get(id)?.[0];
}
