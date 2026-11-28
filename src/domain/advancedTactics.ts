import { Board, PASS, POINTS, neighbours, opposite, pointToHuman, type Color } from './board.ts';
import { decodeMoves, decodePoints, type GameRecord } from './game.ts';

export const ADVANCED_TACTICS_MODULES = [
  {
    id: 'two-eyes',
    level: 5,
    title: 'Reconnaître deux yeux',
    lesson:
      'Deux libertés distinctes intégralement entourées par une même chaîne sont deux yeux sûrs. L’absence de ce certificat ne prouve jamais la mort.',
  },
  {
    id: 'make-life',
    level: 5,
    title: 'Former deux yeux',
    lesson:
      'Cherchez un coup qui divise l’espace intérieur, ou relie les pierres, pour former deux yeux sûrs. Cette lecture est une condition suffisante de vie, pas une classification générale du seki ou du ko.',
  },
  {
    id: 'snapback',
    level: 6,
    title: 'Le sacrifice et la reprise (uttegaeshi)',
    lesson:
      'Après la perte d’une pierre, vérifiez si la reprise immédiate et légale capture davantage de pierres. Contrairement au ko simple, elle ne recrée pas la position précédente.',
  },
  {
    id: 'capture-race',
    level: 6,
    title: 'Gagner une course de libertés (semeai)',
    lesson:
      'Il ne suffit pas de capturer la chaîne adverse : votre propre chaîne menacée doit survivre. Le résultat demandé est local, immédiatement après votre coup.',
  },
  {
    id: 'false-eye',
    level: 5,
    title: 'Démasquer un faux œil',
    lesson:
      'Une intersection vide entièrement bordée de pierres de même couleur peut être un faux œil si ces pierres appartiennent à des chaînes distinctes et qu’une chaîne est prenable. Vérifiez la capture réelle, pas seulement la géométrie.',
  },
  {
    id: 'ladder',
    level: 6,
    title: 'Lire un escalier (shichō)',
    lesson:
      'L’atari se poursuit en escalier lorsque la chaîne adverse s’étend de liberté en liberté. Les pierres lointaines peuvent briser la poursuite. Ici chaque réponse légale est vérifiée à un horizon annoncé : une lecture non concluante ne prouve pas que la chaîne s’échappe.',
  },
] as const;
export const LONG_LADDER_MODULE = {
  id: 'long-ladder',
  level: 6,
  title: 'Tsumego : lecture longue en escalier',
  lesson:
    'Capturez toute la chaîne marquée, en jouant chaque atari. Le dojo choisit une défense légale qui prolonge la résistance. Le nombre de coups est un horizon maximal prouvé, non une garantie générale de vie ou de mort.',
} as const;
export const TACTICS_MODULES = [...ADVANCED_TACTICS_MODULES, LONG_LADDER_MODULE] as const;
export type AdvancedModuleId = (typeof TACTICS_MODULES)[number]['id'];
export interface AdvancedTacticExercise {
  id: string;
  module: AdvancedModuleId;
  gameId: string;
  before: number;
  color: Color;
  anchors: number[];
  candidate?: number;
  reply?: number;
  finish?: number;
  line?: number[];
  horizon?: number;
}
export const advancedIsMove = (module: AdvancedModuleId): boolean => module !== 'two-eyes';
export const ADVANCED_TACTIC_CHOICES = {
  'two-eyes': [
    { value: true, label: 'Deux yeux sûrs' },
    { value: false, label: 'Non démontré' },
  ],
} as const;

function liberties(board: Board, target: number): number[] {
  return [
    ...new Set(
      board
        .stonesOf(target)
        .flatMap(neighbours)
        .filter((p) => board.get(p) === null),
    ),
  ];
}

/** Strict geometric sufficient certificate, for a single connected chain. */
export function safeEyes(board: Board, target: number): number[] {
  const chain = new Set(board.stonesOf(target));
  return liberties(board, target).filter((p) => neighbours(p).every((q) => chain.has(q)));
}

export function snapbackProof(
  board: Board,
  color: Color,
  sacrifice: number,
): { reply: number; finish: number; captures: number } | null {
  if (!playable(sacrifice) || board.get(sacrifice) !== null) return null;
  const next = board.clone();
  const result = next.play(color, sacrifice);
  if (
    result.illegal ||
    result.captures.length ||
    next.stonesOf(sacrifice).length !== 1 ||
    next.libertyCount(sacrifice) !== 1
  )
    return null;
  const reply = liberties(next, sacrifice)[0]!;
  const captured = next.play(opposite(color), reply);
  if (captured.illegal || captured.captures.length !== 1 || captured.captures[0] !== sacrifice)
    return null;
  const finish = next.play(color, sacrifice);
  if (finish.illegal || finish.captures.length < 2 || !finish.captures.includes(reply)) return null;
  return { reply, finish: sacrifice, captures: finish.captures.length };
}

/** An apparent eye formed by separate enemy chains, one of which can already be captured. */
export function falseEyeCapture(
  board: Board,
  color: Color,
  point: number,
  target: number,
): boolean {
  if (!playable(point) || board.get(point) !== null || board.get(target) !== opposite(color))
    return false;
  const adjacent = neighbours(point);
  if (!adjacent.every((p) => board.get(p) === opposite(color))) return false;
  const marked = board.stonesOf(target);
  if (!adjacent.some((p) => marked.includes(p)) || !adjacent.some((p) => !marked.includes(p)))
    return false;
  const next = board.clone();
  const result = next.play(color, point);
  return (
    !result.illegal &&
    result.captures.includes(target) &&
    adjacent.some((p) => next.get(p) === opposite(color))
  );
}

/** Restricted attacker search, exhaustive legal adversary: a positive result is a sufficient bounded capture proof. */
export function ladderProof(
  board: Board,
  color: Color,
  target: number,
  first: number,
  horizon = 9,
): number[] | null {
  if (board.libertyCount(target) !== 2) return null;
  return ladderContinuation(board, color, target, first, horizon);
}

/** A legal direct-atari continuation from either one or two remaining liberties. */
export function ladderContinuation(
  board: Board,
  color: Color,
  target: number,
  first: number,
  horizon: number,
): number[] | null {
  if (
    !playable(first) ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 25 ||
    board.get(target) !== opposite(color) ||
    board.libertyCount(target) > 2 ||
    !liberties(board, target).includes(first)
  )
    return null;
  // The only attacking moves considered are direct atari on the marked chain.
  function attack(position: Board, point: number, remaining: number): number[] | null {
    const next = position.clone();
    const result = next.play(color, point);
    if (result.illegal) return null;
    if (result.captures.includes(target)) return [point];
    if (remaining < 3 || next.libertyCount(target) !== 1) return null;
    const sole = liberties(next, target)[0]!;
    // Try the extension before all other replies to reject escapes early.
    const replies = [
      sole,
      ...Array.from({ length: POINTS + 1 }, (_, p) => p - 1).filter((p) => p !== sole),
    ];
    let longest: number[] = [];
    for (const reply of replies) {
      if (reply !== PASS && next.get(reply) !== null) continue;
      const defended = next.clone();
      if (defended.play(opposite(color), reply).illegal) continue;
      const libs = liberties(defended, target);
      if (libs.length === 0 || libs.length > 2) return null;
      let continuation: number[] | null = null;
      for (const liberty of libs) {
        const line = attack(defended, liberty, remaining - 2);
        if (line && (!continuation || line.length < continuation.length)) continuation = line;
      }
      if (!continuation) return null;
      const branch = [reply, ...continuation];
      if (branch.length > longest.length) longest = branch;
    }
    return [point, ...longest];
  }
  return attack(board, first, horizon);
}

/** A ladder's exemplary defence extends the marked chain at least twice. */
function ladderExtensionCount(
  board: Board,
  color: Color,
  target: number,
  line: readonly number[],
): number {
  const next = board.clone();
  let extensions = 0;
  for (const [i, p] of line.entries()) {
    next.play(i % 2 === 0 ? color : opposite(color), p);
    if (i % 2 === 1 && p !== PASS && next.stonesOf(target).includes(p)) extensions++;
  }
  return extensions;
}

function playable(answer: number | boolean): answer is number {
  return typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer < POINTS;
}

export function judgeAdvancedTactic(
  board: Board,
  ex: AdvancedTacticExercise,
  answer: number | boolean,
): boolean {
  const target = ex.anchors[0]!;
  if (ex.module === 'two-eyes')
    return typeof answer === 'boolean' && answer === safeEyes(board, target).length >= 2;
  if (!playable(answer)) return false;
  const next = board.clone();
  const result = next.play(ex.color, answer);
  if (result.illegal) return false;
  switch (ex.module) {
    case 'make-life':
      return next.get(target) === ex.color && safeEyes(next, target).length >= 2;
    case 'snapback': {
      const proof = snapbackProof(board, ex.color, answer);
      return proof !== null && proof.reply === ex.reply;
    }
    case 'false-eye':
      return falseEyeCapture(board, ex.color, answer, target);
    case 'long-ladder':
      return ladderProof(board, ex.color, target, answer, ex.horizon) !== null;
    case 'ladder': {
      const proof = ladderProof(board, ex.color, target, answer);
      return (
        proof !== null &&
        proof.length >= 5 &&
        ladderExtensionCount(board, ex.color, target, proof) >= 2
      );
    }
    case 'capture-race':
      return (
        board.get(target) === ex.color &&
        board.get(ex.anchors[1]!) === opposite(ex.color) &&
        next.get(target) === ex.color &&
        next.libertyCount(target) >= 2 &&
        result.captures.includes(ex.anchors[1]!)
      );
  }
}

export function advancedTacticQuestion(_board: Board, ex: AdvancedTacticExercise): string {
  const [a, b] = ex.anchors.map(pointToHuman);
  const c = ex.color === 'B' ? 'Noir' : 'Blanc';
  switch (ex.module) {
    case 'two-eyes':
      return `La chaîne en ${a} possède-t-elle déjà deux yeux d’une intersection, entourés uniquement par ses propres pierres ?`;
    case 'make-life':
      return `Au trait : ${c}. Donnez deux yeux sûrs à la chaîne en ${a} en un seul coup.`;
    case 'snapback':
      return `Au trait : ${c}. Trouvez un sacrifice d’une pierre près de ${a}. Si l’adversaire la capture en ${pointToHuman(ex.reply!)}, vous pourrez reprendre au moins deux pierres immédiatement.`;
    case 'false-eye':
      return `Au trait : ${c}. Trouvez le point vide qui paraît un œil adverse, mais est bordé de chaînes distinctes. Jouez-y pour capturer la chaîne en ${a}.`;
    case 'long-ladder':
      return `Au trait : ${c}. Capturez en escalier la chaîne en ${a}, en jouant chacun de vos coups. Lecture prouvée en ${ex.horizon} demi-coups au plus.`;
    case 'ladder':
      return `Au trait : ${c}. Lancez une capture en escalier de la chaîne en ${a}. Elle doit rester forcée contre toute réponse légale, en neuf demi-coups au plus.`;
    case 'capture-race':
      return `Au trait : ${c}. Sauvez votre chaîne en ${a} (en atari), en capturant celle en ${b} ; votre chaîne doit avoir au moins deux libertés après le coup.`;
  }
}

export function advancedTacticSolution(
  board: Board,
  ex: AdvancedTacticExercise,
  historical?: number,
): string {
  const target = ex.anchors[0]!;
  if (ex.module === 'two-eyes') {
    const eyes = safeEyes(board, target);
    return eyes.length >= 2
      ? `Les yeux sûrs sont en ${eyes.map(pointToHuman).join(' et ')}. Ils appartiennent à la même chaîne : l’adversaire ne peut remplir ni l’un ni l’autre tant que l’autre reste libre.`
      : `La chaîne ne possède que ${eyes.length} œil(s) de cette forme. Cela ne démontre pas sa mort : des yeux plus grands, une défense, un ko ou un seki restent possibles.`;
  }
  const answer = ex.candidate ?? historical!;
  const next = board.clone();
  const result = next.play(ex.color, answer);
  switch (ex.module) {
    case 'make-life':
      return `En ${pointToHuman(answer)}, les yeux sûrs de la chaîne sont ${safeEyes(next, target).map(pointToHuman).join(' et ')}. Le coup préserve au moins deux libertés internes inaccessibles.`;
    case 'snapback': {
      const proof = snapbackProof(board, ex.color, answer)!;
      return `Variante calculée : sacrifice en ${pointToHuman(answer)}, capture adverse en ${pointToHuman(proof.reply)}, reprise en ${pointToHuman(proof.finish)} de ${proof.captures} pierres. La capture adverse est une réponse possible, pas imposée.`;
    }
    case 'false-eye':
      return `En ${pointToHuman(answer)}, les chaînes ennemies ne sont pas toutes reliées. Le coup est légal et capture ${result.captures.length} pierre(s) : ce faux œil n’assure pas la vie.`;
    case 'long-ladder':
    case 'ladder': {
      const line = ex.line ?? ladderProof(board, ex.color, target, answer, ex.horizon)!;
      return `Variante calculée : ${line.map((p, i) => `${i + 1}. ${pointToHuman(p)}`).join(' · ')}. La chaîne est capturée malgré toutes les réponses légales vérifiées dans cet horizon (ko simple).`;
    }
    case 'capture-race':
      return `Le coup en ${pointToHuman(answer)} capture ${result.captures.length} pierres et donne ${next.libertyCount(target)} libertés à votre chaîne ; cela résout la menace immédiate, sans prétendre résoudre tout le combat.`;
  }
}

/** Select exact historical positions, with explicitly calculated legal variants. */
export function extractAdvancedTactics(games: readonly GameRecord[]): AdvancedTacticExercise[] {
  const max = 24;
  const collected = new Map<AdvancedModuleId, AdvancedTacticExercise[]>(
    ADVANCED_TACTICS_MODULES.map((m) => [m.id, []]),
  );
  let eyeYes = 0,
    eyeNo = 0;
  // Interleave dates across the entire career rather than drawing consecutive games.
  const ordered = [...games]
    .filter((g) => !g.imported && !g.rengo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const distributed = Array.from({ length: 17 }, (_, i) =>
    ordered.filter((_, j) => j % 17 === i),
  ).flat();
  for (const game of distributed) {
    const board = new Board();
    for (const p of decodePoints(game.setupBlack)) board.setup(p, 'B');
    const seen = new Set<string>();

    for (const [before, move] of decodeMoves(game.moves).entries()) {
      const { color, point } = move;
      if (point === PASS) {
        board.play(color, point);
        continue;
      }
      const after = board.clone();
      const result = after.play(color, point);
      if (result.illegal) break;
      const add = (
        module: AdvancedModuleId,
        anchors: number[],
        candidate?: number,
        proof?: { reply?: number; finish?: number; line?: number[] },
      ) => {
        const list = collected.get(module)!;
        const key =
          module === 'two-eyes'
            ? module + String(safeEyes(board, anchors[0]!).length >= 2)
            : module;
        if (
          seen.has(key) ||
          list.length >= max ||
          list.some((e) => e.gameId === game.id && e.before === before)
        )
          return false;
        const ex: AdvancedTacticExercise = {
          id: `${module}:${game.id}:${before}`,
          module,
          gameId: game.id,
          before,
          color,
          anchors,
          ...(candidate === undefined ? {} : { candidate }),
          ...proof,
        };
        if (
          !judgeAdvancedTactic(
            board,
            ex,
            module === 'two-eyes' ? safeEyes(board, anchors[0]!).length >= 2 : candidate!,
          )
        )
          return false;
        list.push(ex);
        seen.add(key);
        return true;
      };
      const oldOwn = [...new Set(neighbours(point).filter((p) => board.get(p) === color))];
      if (
        before > 45 &&
        before % 5 === 0 &&
        ((!seen.has('two-eyestrue') && eyeYes < max / 2) ||
          (!seen.has('two-eyesfalse') && eyeNo < max / 2))
      ) {
        for (let a = 0; a < POINTS; a++) {
          if (board.get(a) === null) continue;
          const e = safeEyes(board, a).length;
          if (e >= 2 && eyeYes < max / 2 && !seen.has('two-eyestrue')) {
            if (add('two-eyes', [a])) {
              eyeYes++;
              break;
            }
          }
          if (e === 1 && eyeNo < max / 2 && !seen.has('two-eyesfalse')) {
            if (add('two-eyes', [a])) {
              eyeNo++;
              break;
            }
          }
        }
      }
      if (before > 35 && !seen.has('make-life') && collected.get('make-life')!.length < max) {
        const local = [
          ...new Set([point, ...neighbours(point), ...neighbours(point).flatMap(neighbours)]),
        ];
        for (const p of local) {
          if (
            board.get(p) !== null ||
            neighbours(p).filter((q) => board.get(q) === color).length < 2
          )
            continue;
          const own = neighbours(p).filter((q) => board.get(q) === color);
          const variant = p === point ? after : board.clone();
          if (p !== point && variant.play(color, p).illegal) continue;
          if (safeEyes(variant, p).length < 2) continue;
          const a = own.find((q) => safeEyes(board, q).length < 2);
          if (a !== undefined && add('make-life', [a], p)) break;
        }
      }
      if (before > 35 && !seen.has('snapback') && collected.get('snapback')!.length < max) {
        const local = Array.from({ length: POINTS }, (_, p) => p).filter(
          (p) => board.get(p) === null,
        );
        for (const p of local) {
          const closeEnemy = neighbours(p).find((q) => board.get(q) === opposite(color));
          if (
            closeEnemy === undefined ||
            neighbours(p).filter((q) => board.get(q) === null).length !== 1 ||
            neighbours(p).some((q) => board.get(q) === color)
          )
            continue;
          const proof = snapbackProof(board, color, p);
          if (
            proof &&
            add('snapback', [closeEnemy], p, { reply: proof.reply, finish: proof.finish })
          )
            break;
        }
      }
      if (
        result.captures.length &&
        !seen.has('capture-race') &&
        collected.get('capture-race')!.length < max
      ) {
        const ownCandidates = [
          ...new Set(
            result.captures
              .flatMap(neighbours)
              .concat(oldOwn)
              .filter((p) => board.get(p) === color),
          ),
        ];
        for (const a of ownCandidates) {
          if (board.libertyCount(a) !== 1 || after.libertyCount(a) < 2) continue;
          const target = result.captures.find((p) =>
            neighbours(p).some((q) => board.stonesOf(a).includes(q)),
          );
          if (target !== undefined && add('capture-race', [a, target], point)) break;
        }
      }
      if (
        before > 25 &&
        !seen.has('false-eye') &&
        collected.get('false-eye')!.length < max &&
        result.captures.length
      ) {
        const target = result.captures.find((p) => falseEyeCapture(board, color, point, p));
        if (target !== undefined) add('false-eye', [target], point);
      }
      if (
        before > 12 &&
        !seen.has('ladder') &&
        collected.get('ladder')!.length < max &&
        !result.captures.length
      ) {
        for (const a of neighbours(point).filter((p) => board.get(p) === opposite(color))) {
          if (board.libertyCount(a) !== 2 || after.libertyCount(a) !== 1) continue;
          const extension = liberties(after, a)[0]!;
          const defend = after.clone();
          if (defend.play(opposite(color), extension).illegal || defend.libertyCount(a) !== 2)
            continue;
          const line = ladderProof(board, color, a, point);
          if (
            line &&
            line.length >= 5 &&
            ladderExtensionCount(board, color, a, line) >= 2 &&
            add('ladder', [a], point, { line })
          )
            break;
        }
      }
      board.play(color, point);
    }
    if ([...collected.values()].every((list) => list.length >= max)) break;
  }
  return [...collected.values()].flat();
}
