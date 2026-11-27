import { Board, POINTS, PASS, neighbours, opposite, pointToHuman, type Color } from './board.ts';
import { decodeMoves, decodePoints, type GameRecord } from './game.ts';

export const ENDGAME_MODULES = [
  {
    id: 'yose-captures',
    level: 9,
    title: 'Captures en fin de partie',
    lesson:
      'Au yose, même une seule pierre compte. Lisez les libertés des chaînes voisines avant de jouer le coup du kifu.',
  },
  {
    id: 'yose-prisoners',
    level: 9,
    title: 'Tenir le compte des prisonniers',
    lesson:
      'En comptage japonais, une pierre capturée vaut un point pour le joueur qui la capture. Les pierres mortes retirées au décompte s’ajoutent aux prisonniers.',
  },
  {
    id: 'yose-boundary',
    level: 9,
    title: 'Dame ou espace fermé ?',
    lesson:
      'Une intersection vide ayant des frontières des deux couleurs est géométriquement neutre. Il faut cependant établir la vie des chaînes avant de parler de dame ou de territoire définitif.',
  },
  {
    id: 'yose-value',
    level: 9,
    title: 'Mesurer un coup de yose',
    lesson:
      'Comparez les points vides entourés par une seule couleur et les prisonniers, avant et après un coup. Ce bilan instantané n’est ni la valeur optimale d’un échange de yose, ni le résultat final.',
  },
  {
    id: 'yose-count',
    level: 9,
    title: 'Compter les points japonais',
    lesson:
      'Les points japonais comprennent le territoire et les prisonniers, avec le komi ajouté aux Blancs. Sans accord sur les morts et les groupes en seki ou sans komi documenté, le résultat exact n’est pas déterminé.',
  },
] as const;
export type EndgameModuleId = (typeof ENDGAME_MODULES)[number]['id'];
export interface EndgameChoice {
  value: number;
  label: string;
}
export interface EndgameExercise {
  id: string;
  module: EndgameModuleId;
  gameId: string;
  before: number;
  color: Color;
  anchors: number[];
  candidate: number;
  input: 'choice';
  choices: EndgameChoice[];
  question: string;
  answer: number;
  explanation: string;
}
export interface EndgameJudge {
  correct: boolean;
  answer: number;
  explanation: string;
}
export function judgeEndgame(exercise: EndgameExercise, answer: number | boolean): EndgameJudge {
  return {
    correct: answer === exercise.answer,
    answer: exercise.answer,
    explanation: exercise.explanation,
  };
}

type Totals = { B: number; W: number };
interface Region {
  points: number[];
  border: Set<Color>;
  touchesSeki: boolean;
}
function regionAt(board: Board, start: number, seki: ReadonlySet<number> = new Set()): Region {
  const points = [start];
  const visited = new Set(points);
  const border = new Set<Color>();
  let touchesSeki = false;
  for (let i = 0; i < points.length; i++) {
    for (const next of neighbours(points[i]!)) {
      const color = board.get(next);
      if (color !== null) {
        border.add(color);
        touchesSeki ||= seki.has(next);
      } else if (!visited.has(next)) {
        visited.add(next);
        points.push(next);
      }
    }
  }
  return { points, border, touchesSeki };
}
function territories(
  board: Board,
  seki: ReadonlySet<number> = new Set(),
): { territory: Totals; neutral: number } {
  const territory = { B: 0, W: 0 };
  let neutral = 0;
  const seen = new Set<number>();
  for (let p = 0; p < POINTS; p++) {
    if (seen.has(p) || board.get(p) !== null) continue;
    const zone = regionAt(board, p, seki);
    for (const q of zone.points) seen.add(q);
    const owner = zone.border.size === 1 && !zone.touchesSeki ? [...zone.border][0] : undefined;
    if (owner) territory[owner] += zone.points.length;
    else neutral += zone.points.length;
  }
  return { territory, neutral };
}
export interface JapaneseScoreAgreement {
  /** One or more occupied anchors per agreed dead chain; no inference of status. */
  dead: readonly number[];
  /** Occupied anchors of all agreed living chains in seki; their enclosed points do not score. */
  seki: readonly number[];
  /** Exact, explicitly supplied komi (no default). */
  komi: number;
}
export interface JapaneseScore {
  territory: Totals;
  neutral: number;
  prisoners: Totals;
  agreedDead: Totals;
  points: Totals;
  komi: number;
  winner: Color | 'jigo';
  margin: number;
}
function designatedChains(board: Board, anchors: readonly number[]): Set<number> {
  const points = new Set<number>();
  for (const anchor of anchors) {
    if (board.get(anchor) === null) throw new RangeError('Une chaîne désignée doit être occupée');
    for (const p of board.stonesOf(anchor)) points.add(p);
  }
  return points;
}
/** Formal territory scoring on a position already settled by agreement. This is not a life/death solver. */
export function countJapaneseScore(
  board: Board,
  prisoners: Totals,
  agreement: JapaneseScoreAgreement,
): JapaneseScore {
  if (!Number.isFinite(agreement.komi)) throw new RangeError('Le komi doit être connu');
  for (const count of [prisoners.B, prisoners.W]) {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new RangeError('Nombre de prisonniers invalide');
  }
  const dead = designatedChains(board, agreement.dead);
  const seki = designatedChains(board, agreement.seki);
  const settled = board.clone();
  const agreedDead = { B: 0, W: 0 };
  for (const p of dead) {
    if (seki.has(p)) throw new RangeError('Une pierre ne peut être morte et vivante en seki');
    agreedDead[board.get(p)!]++;
    settled.setup(p, null);
  }
  // Article 10: agreed dead stones outside opposing territory must be captured in play,
  // not removed automatically during counting. Refuse an agreement that cannot be settled.
  for (const p of dead) {
    const zone = regionAt(settled, p, seki);
    if (zone.border.size !== 1 || !zone.border.has(opposite(board.get(p)!)) || zone.touchesSeki) {
      throw new RangeError(
        'Une pierre morte hors du territoire adverse doit être capturée avant le décompte',
      );
    }
  }
  const { territory, neutral } = territories(settled, seki);
  const finalPrisoners = { B: prisoners.B + agreedDead.W, W: prisoners.W + agreedDead.B };
  const points = {
    B: territory.B + finalPrisoners.B,
    W: territory.W + finalPrisoners.W + agreement.komi,
  };
  const delta = points.B - points.W;
  return {
    territory,
    neutral,
    prisoners: finalPrisoners,
    agreedDead,
    points,
    komi: agreement.komi,
    winner: delta > 0 ? 'B' : delta < 0 ? 'W' : 'jigo',
    margin: Math.abs(delta),
  };
}

function numericChoices(answer: number, minimum?: number, seed = 0): EndgameChoice[] {
  const first = Math.max(minimum ?? -Infinity, answer - Math.abs(seed % 5));
  return Array.from({ length: 5 }, (_, i) => ({ value: first + i, label: String(first + i) }));
}
const boundaryChoices: EndgameChoice[] = [
  { value: 1, label: 'Noire seulement' },
  { value: 2, label: 'Blanche seulement' },
  { value: 3, label: 'Les deux couleurs (neutre)' },
];
const name = (color: Color) => (color === 'B' ? 'Noir' : 'Blanc');
const balance = (territory: Totals, prisoners: Totals, color: Color) =>
  territory[color] + prisoners[color] - territory[opposite(color)] - prisoners[opposite(color)];

/** Deterministic historical extraction. At most one example of each kind per game. No engine or fabricated positions. */
export function extractEndgame(
  games: readonly GameRecord[],
  quotaPerModule = 32,
): EndgameExercise[] {
  const catalog: EndgameExercise[] = [];
  const counts = new Map<EndgameModuleId, number>();
  if (!Number.isSafeInteger(quotaPerModule) || quotaPerModule < 0)
    throw new RangeError('Quota invalide');
  if (quotaPerModule === 0) return catalog;
  const historical = games.filter((game) => !game.imported && !game.rengo);
  const stride = Math.max(1, Math.ceil(historical.length / quotaPerModule));
  const ordered = Array.from({ length: stride }, (_, offset) =>
    historical.filter((_, i) => i % stride === offset),
  ).flat();
  for (const game of ordered) {
    if (ENDGAME_MODULES.every(({ id }) => (counts.get(id) ?? 0) >= quotaPerModule)) break;
    const moves = decodeMoves(game.moves);
    const board = new Board();
    for (const p of decodePoints(game.setupBlack)) board.setup(p, 'B');
    const prisoners: Totals = { B: 0, W: 0 };
    const pending = new Map<EndgameModuleId, EndgameExercise>();
    const priorities = new Map<EndgameModuleId, number>();
    // A move-number filter selects late records, not a claim that all groups are settled.
    const lateFrom = Math.max(120, Math.floor(0.7 * moves.length));
    let valid = true;
    for (let before = 0; before < moves.length; before++) {
      const { color, point } = moves[before]!;
      const late = before >= lateFrom && point !== PASS;
      const previous = late ? board.clone() : undefined;
      const result = board.play(color, point);
      if (result.illegal) {
        valid = false;
        break;
      }
      const captures = result.captures.length;
      const previousPrisoners = { ...prisoners };
      prisoners[color] += captures;
      if (!previous) continue;
      const add = (
        module: EndgameModuleId,
        answer: number,
        question: string,
        explanation: string,
        anchors: number[],
        choices = numericChoices(answer, undefined, point + before),
        priority = 0,
      ) => {
        if (
          (priorities.get(module) ?? -Infinity) >= priority ||
          (counts.get(module) ?? 0) >= quotaPerModule
        )
          return;
        priorities.set(module, priority);
        pending.set(module, {
          id: `${module}:${game.id}:${before}`,
          module,
          gameId: game.id,
          before,
          color,
          anchors,
          candidate: point,
          input: 'choice',
          question,
          answer,
          explanation,
          choices,
        });
      };
      const moveLabel = `${name(color)} ${before + 1} en ${pointToHuman(point)}`;
      if (captures > 0) {
        add(
          'yose-captures',
          captures,
          `Combien de pierres adverses ${moveLabel} retire-t-il ?`,
          `Le kifu confirme ${captures} pierre(s) retirée(s) : ${result.captures.map(pointToHuman).join(', ')}. Elles deviennent des prisonniers de ${name(color)}.`,
          [],
          numericChoices(captures, 0, before + point),
          captures,
        );
        add(
          'yose-prisoners',
          prisoners[color],
          `${name(color)} possède déjà ${previousPrisoners[color]} prisonnier(s). Quel est son total après ${moveLabel} ?`,
          `Le coup retire ${captures} pierre(s). Total : ${previousPrisoners[color]} + ${captures} = ${prisoners[color]} prisonniers.`,
          [],
          numericChoices(prisoners[color], 0, before + point),
          captures,
        );
      }
      const zone = regionAt(previous, point);
      if (zone.points.length <= 5 && zone.border.size > 0) {
        const boundary = zone.border.size === 2 ? 3 : zone.border.has('B') ? 1 : 2;
        add(
          'yose-boundary',
          boundary,
          `Avant ${moveLabel}, quelle couleur borde la petite zone vide indiquée ?`,
          `Cette zone contient ${zone.points.length} intersection(s), bordée(s) par ${boundaryChoices[boundary - 1]!.label.toLowerCase()}. Une frontière mixte est géométriquement neutre et une frontière unicolore ne prouve pas la vie des chaînes.`,
          zone.points,
          boundaryChoices,
          boundary === ((counts.get('yose-boundary') ?? 0) % 3) + 1 ? 1 : 0,
        );
        const a = territories(previous).territory;
        const b = territories(board).territory;
        const delta = balance(b, prisoners, color) - balance(a, previousPrisoners, color);
        // Avoid large changes in unresolved regions: teach small, measured changes only.
        if (Math.abs(b.B - a.B) <= 5 && Math.abs(b.W - a.W) <= 5 && Math.abs(delta) <= 8) {
          add(
            'yose-value',
            delta,
            `Quel changement du bilan géométrique de ${name(color)} (ses points vides unicolores + prisonniers, moins ceux de l’adversaire) produit ${moveLabel} ?`,
            `Avant : N ${a.B} / B ${a.W} points vides unicolores ; après : N ${b.B} / B ${b.W}. Le coup ajoute aussi ${captures} prisonnier(s) à ${name(color)}. Son bilan change de ${delta} point(s). Ceci ne mesure pas la valeur d’un échange complet ni un territoire garanti.`,
            zone.points,
            numericChoices(delta, undefined, point + before),
            Math.sign(delta) === ((counts.get('yose-value') ?? 0) % 3) - 1 ? 1 : 0,
          );
        }
        const scoreDelta = balance(a, previousPrisoners, 'B');
        add(
          'yose-count',
          scoreDelta,
          `À ce stade : Noir ${a.B} points vides unicolores + ${previousPrisoners.B} prisonniers ; Blanc ${a.W} + ${previousPrisoners.W}. Quel serait l’écart Noir − Blanc avant komi, si tous les groupes étaient vivants et aucun en seki ?`,
          `(${a.B} + ${previousPrisoners.B}) − (${a.W} + ${previousPrisoners.W}) = ${scoreDelta}. ${game.komi === undefined ? 'Le komi n’est pas documenté : aucun score final ne peut en être déduit.' : `Le komi documenté est ${game.komi}, non inclus dans cette question.`} Le résultat enregistré est « ${game.result.raw} » ; cette position historique reste intermédiaire, et les hypothèses ne valent pas adjudication.`,
          zone.points,
          numericChoices(scoreDelta, undefined, point + before),
          before,
        );
      }
    }
    if (valid)
      for (const [module, exercise] of pending) {
        catalog.push(exercise);
        counts.set(module, (counts.get(module) ?? 0) + 1);
      }
  }
  return catalog;
}
