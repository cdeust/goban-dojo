import { Board, PASS, POINTS, SIZE, opposite, pointToHuman, type Color } from '../domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord, type Move } from '../domain/game.ts';

export const STRATEGY_MODULES = [
  {
    id: 'fuseki',
    level: 7,
    title: 'Distribuer ses forces au fuseki',
    lesson:
      'Les coins, les côtés et le centre ne se construisent pas au même coût. Comparez la distribution des pierres avant de prolonger une position locale.',
  },
  {
    id: 'approach',
    level: 7,
    title: 'Aborder un coin adverse',
    lesson:
      'Un kakari conteste le développement du coin. Une approche en saut de cavalier laisse des réponses différentes selon les pierres voisines. La forme seule ne détermine pas le meilleur coup.',
  },
  {
    id: 'corner-response',
    level: 7,
    title: 'Lire les échanges du coin',
    lesson:
      'Les joseki sont des séquences locales étudiées, mais leur pertinence dépend du goban entier. Une séquence historique n’est pas nécessairement un joseki moderne. Étudiez les conséquences locales des deux choix.',
  },
  {
    id: 'direction',
    level: 7,
    title: 'Choisir une direction de jeu',
    lesson:
      'Une extension le long d’un côté développe une pierre existante. Comparez l’espace disponible, les forces voisines et les possibilités de l’adversaire avant de choisir où s’étendre.',
  },
  {
    id: 'influence',
    level: 8,
    title: 'Exploiter une chaîne et ses libertés',
    lesson:
      'Une chaîne avec plusieurs libertés peut offrir un appui, mais les libertés seules ne prouvent ni la vie ni l’influence. Comparez le développement vers le centre et les risques de faiblesse.',
  },
  {
    id: 'reduction',
    level: 8,
    title: 'Réduire ou envahir',
    lesson:
      'Réduire une zone d’influence et pénétrer profondément pour prendre une base sont des objectifs distincts. Des pierres adverses proches n’impliquent pas un territoire acquis. Examinez les sorties et les possibilités de vie.',
  },
  {
    id: 'initiative',
    level: 8,
    title: 'Répondre ou changer de secteur',
    lesson:
      'Un tenuki laisse une situation locale pour jouer ailleurs. Le sente dépend des suites et des menaces réelles : un changement de secteur ne suffit pas à le démontrer. Comparez le coût de ne pas répondre au dernier coup.',
  },
] as const;

export type StrategyModule = (typeof STRATEGY_MODULES)[number]['id'];

export interface StrategyLesson {
  id: string;
  module: StrategyModule;
  gameId: string;
  /** Exact kifu prefix length; next recorded move has number before + 1. */
  before: number;
  color: Color;
  anchors: number[];
  historical: number;
  /** Counterfactual order: these points are actual later same-color plays, legal at this position. */
  alternatives: number[];
  prompt: string;
  /** Reveal only after the learner chooses. Geometric observations, not evaluations. */
  observation: string;
  rubric: string;
  evidence: {
    sources: string[];
    alternativeSources: { point: number; before: number }[];
    historicalLine: Move[];
    previous?: number;
    anchorSize?: number;
    anchorLiberties?: number;
  };
}

const xy = (p: number): [number, number] => [p % SIZE, Math.floor(p / SIZE)];
function distance(a: number, b: number): number {
  const [x, y] = xy(a),
    [u, v] = xy(b);
  return Math.abs(x - u) + Math.abs(y - v);
}
function corner(p: number): number {
  const [x, y] = xy(p);
  if (Math.min(x, SIZE - 1 - x) > 5 || Math.min(y, SIZE - 1 - y) > 5) return -1;
  return Number(x >= SIZE / 2) + 2 * Number(y >= SIZE / 2);
}
function side(p: number): number {
  const [x, y] = xy(p);
  const d = [x, y, SIZE - 1 - x, SIZE - 1 - y];
  return d.indexOf(Math.min(...d));
}
function line(p: number): number {
  const [x, y] = xy(p);
  return 1 + Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
}
const knight = (a: number, b: number): boolean => {
  const [x, y] = xy(a),
    [u, v] = xy(b);
  return Math.abs(x - u) * Math.abs(y - v) === 2;
};
const label = pointToHuman;

type Finding = Pick<StrategyLesson, 'module' | 'anchors' | 'prompt' | 'observation' | 'rubric'> & {
  previous?: number;
  anchorSize?: number;
  anchorLiberties?: number;
  alternativeFilter?: (p: number) => boolean;
};

function findings(board: Board, moves: Move[], before: number, handicap: number): Finding[] {
  const move = moves[before]!;
  const p = move.point;
  if (p === PASS || before < 2 || before > 130) return [];
  const enemy = opposite(move.color);
  const own: number[] = [],
    other: number[] = [];
  for (let q = 0; q < POINTS; q++) {
    const color = board.get(q);
    if (color === move.color) own.push(q);
    if (color === enemy) other.push(q);
  }
  const prev = moves[before - 1]!.point;
  const recorded = label(p);
  const result: Finding[] = [];
  const closest = (stones: number[]) => [...stones].sort((a, b) => distance(a, p) - distance(b, p));
  if (
    !handicap &&
    before <= 10 &&
    corner(p) >= 0 &&
    ![...own, ...other].some((q) => corner(q) === corner(p))
  ) {
    result.push({
      module: 'fuseki',
      anchors: [],
      prompt:
        'Quel secteur peu occupé développer maintenant ? Comparez la répartition des forces sur les quatre coins.',
      observation: `Le kifu joue ${recorded} dans un coin sans pierre dans son secteur de 6 × 6. Cela établit un nouveau point d’appui, sans garantir de territoire.`,
      rubric:
        'Identifier les coins encore libres, puis comparer le développement et le coût de laisser les autres secteurs ouverts.',
      alternativeFilter: (q) => corner(q) >= 0 && corner(q) !== corner(p),
    });
  }
  if (before <= 32 && corner(p) >= 0) {
    const approached = closest(other).find(
      (q) => corner(q) === corner(p) && knight(p, q) && line(q) >= 3,
    );
    if (approached !== undefined)
      result.push({
        module: 'approach',
        anchors: [approached],
        prompt:
          'Comment aborder ce coin adverse ? Comparez la pression sur la pierre repérée et le développement du reste du goban.',
        observation: `Le coup historique ${recorded} est à un saut de cavalier de la pierre adverse en ${label(approached)}. C’est une relation géométrique observable, pas une prescription de joseki.`,
        rubric:
          'Identifier l’espace laissé autour de la pierre adverse, les réponses possibles et les soutiens de chaque couleur.',
      });
  }
  if (
    before <= 50 &&
    prev !== PASS &&
    corner(prev) >= 0 &&
    corner(p) === corner(prev) &&
    distance(p, prev) <= 4
  ) {
    const support = closest(own).find((q) => corner(q) === corner(p) && distance(q, p) <= 3);
    if (support !== undefined)
      result.push({
        module: 'corner-response',
        anchors: [prev, support],
        previous: prev,
        prompt:
          'Après le dernier coup adverse, quelle réponse locale envisager ? Comparez la sécurité du coin et la sortie vers le centre.',
        observation: `La réponse historique ${recorded} suit ${label(prev)} dans le même coin, à ${distance(p, prev)} intersections orthogonales de distance, près d’une pierre amie en ${label(support)}. La suite du kifu peut être rejouée, sans lui attribuer le statut de joseki universel.`,
        rubric:
          'Examiner à qui profitent l’espace extérieur, le coin et la connexion après les réponses possibles ; tenir compte des autres secteurs.',
      });
  }
  if (before >= 10 && before <= 65 && line(p) >= 3 && line(p) <= 5) {
    const support = closest(own).find(
      (q) =>
        side(q) === side(p) && line(q) === line(p) && distance(q, p) >= 2 && distance(q, p) <= 4,
    );
    if (support !== undefined && !other.some((q) => distance(q, p) <= 1))
      result.push({
        module: 'direction',
        anchors: [support],
        prompt:
          'Dans quelle direction développer cette pierre ? Comparez les débouchés du côté et les zones que l’adversaire peut encore occuper.',
        observation: `Le kifu choisit ${recorded}, à ${distance(p, support)} intersections de ${label(support)}, sur la même ${line(p)}e ligne. Aucune pierre adverse n’est directement adjacente au point joué.`,
        rubric:
          'Comparer les espaces accessibles de chaque côté, les pierres adverses voisines et la solidité du point d’appui.',
      });
  }
  if (before >= 20 && before <= 110 && line(p) >= 4) {
    const support = closest(own).find(
      (q) =>
        distance(q, p) >= 2 &&
        distance(q, p) <= 4 &&
        board.stonesOf(q).length >= 3 &&
        board.libertyCount(q) >= 4 &&
        line(q) < line(p),
    );
    if (support !== undefined) {
      const size = board.stonesOf(support).length,
        liberties = board.libertyCount(support);
      result.push({
        module: 'influence',
        anchors: [support],
        anchorSize: size,
        anchorLiberties: liberties,
        prompt:
          'Comment employer cette chaîne comme point d’appui pour se développer ? Vérifiez ses libertés et distinguez sécurité locale et influence.',
        observation: `Avant le coup ${recorded}, la chaîne repérée en ${label(support)} contient ${size} pierres et ${liberties} libertés. Le point joué se situe plus loin du bord que la pierre repérée ; cela ne prouve pas que la chaîne soit vivante ni que son influence soit acquise.`,
        rubric:
          'Compter les libertés, rechercher les menaces ou les coupures, puis comparer le développement avec une autre zone.',
      });
    }
  }
  if (before >= 25 && line(p) >= 3 && !own.some((q) => distance(q, p) <= 2)) {
    const nearby = closest(other).filter((q) => distance(q, p) <= 4);
    const [x, y] = xy(p);
    const sectors = new Set(
      nearby.map((q) => {
        const [a, b] = xy(q);
        return Math.abs(a - x) >= Math.abs(b - y) ? (a < x ? 0 : 1) : b < y ? 2 : 3;
      }),
    );
    if (nearby.length >= 3 && sectors.size >= 2)
      result.push({
        module: 'reduction',
        anchors: nearby.slice(0, 3),
        prompt:
          'Faut-il pénétrer près des pierres adverses ou jouer plus loin ? Comparez une réduction prudente, une intrusion profonde et la possibilité de sortir.',
        observation: `Le coup historique ${recorded} est à quatre intersections ou moins de ${nearby.length} pierres adverses, réparties dans au moins deux directions, sans pierre amie à deux intersections ou moins. Ce relevé de proximité ne constitue pas une mesure de territoire.`,
        rubric:
          'Rechercher une base, des voies de sortie et les réponses adverses. Expliquer le risque d’isolement avant de comparer les coups par IA.',
      });
  }
  if (before >= 15 && prev !== PASS && distance(prev, p) >= 8)
    result.push({
      module: 'initiative',
      anchors: [prev],
      previous: prev,
      prompt:
        'Faut-il répondre au dernier coup adverse ou jouer ailleurs ? Cherchez d’abord une menace locale réelle.',
      observation: `Le kifu passe de ${label(prev)} à ${recorded}, à ${distance(prev, p)} intersections orthogonales de distance. Il change de secteur sans prouver que le coup précédent soit gote ni que le nouveau soit sente.`,
      rubric:
        'Comparer le coût d’une absence de réponse locale et le bénéfice du coup éloigné. Examiner la suite effective avant de conclure sur l’initiative.',
      alternativeFilter: (q) => distance(q, prev) <= 4,
    });
  return result;
}

/** Build authentic case studies from exact legal kifu prefixes. No score or optimality is inferred. */
export function extractStrategyCourse(games: readonly GameRecord[], quota = 12): StrategyLesson[] {
  const count = Math.max(0, Math.min(30, Math.floor(quota)));
  const groups = new Map<StrategyModule, StrategyLesson[]>(STRATEGY_MODULES.map((m) => [m.id, []]));
  const historical = games.filter((g) => !g.imported && !g.rengo && g.sources.length > 0);
  // Fixed permutation interleaves the corpus rather than concentrating on the earliest games.
  const ordered = [...historical].sort((a, b) => a.id.localeCompare(b.id));
  const stride = Math.max(1, Math.ceil(ordered.length / Math.max(1, count)));
  const interleaved = Array.from({ length: stride }, (_, offset) =>
    ordered.filter((_, i) => i % stride === offset),
  ).flat();
  const used = new Set<string>();
  for (const game of interleaved) {
    if ([...groups.values()].every((group) => group.length >= count)) break;
    const moves = decodeMoves(game.moves);
    const board = new Board();
    for (const point of decodePoints(game.setupBlack)) board.setup(point, 'B');
    const seen = new Set([board.positionKey()]);
    for (let before = 0; before < Math.min(131, moves.length); before++) {
      const move = moves[before]!;
      const played = board.clone();
      const play = played.play(move.color, move.point);
      const key = played.positionKey();
      if (play.illegal || (move.point !== PASS && seen.has(key))) break;
      if (before > 0 && move.color === moves[before - 1]!.color) break;
      if (move.point !== PASS && !play.captures.length && played.libertyCount(move.point) >= 2) {
        for (const finding of findings(board, moves, before, game.handicap)) {
          const group = groups.get(finding.module)!;
          if (
            group.length >= count ||
            group.some((l) => l.gameId === game.id) ||
            used.has(`${game.id}:${before}`)
          )
            continue;
          const alternatives: StrategyLesson['evidence']['alternativeSources'] = [];
          for (let i = before + 2; i < Math.min(moves.length, before + 25); i++) {
            const later = moves[i]!;
            if (
              later.color !== move.color ||
              later.point === PASS ||
              later.point === move.point ||
              alternatives.some((a) => a.point === later.point) ||
              (finding.alternativeFilter && !finding.alternativeFilter(later.point))
            )
              continue;
            const trial = board.clone();
            if (trial.play(move.color, later.point).illegal || seen.has(trial.positionKey()))
              continue;
            alternatives.push({ point: later.point, before: i });
            if (alternatives.length >= 2) break;
          }
          if (!alternatives.length) continue;
          group.push({
            id: `${finding.module}:${game.id}:${before}`,
            module: finding.module,
            gameId: game.id,
            before,
            color: move.color,
            anchors: finding.anchors,
            historical: move.point,
            alternatives: alternatives.map((a) => a.point),
            prompt: finding.prompt,
            observation: finding.observation,
            rubric: finding.rubric,
            evidence: {
              sources: [...game.sources],
              alternativeSources: alternatives,
              historicalLine: moves.slice(before, before + 5),
              ...(finding.previous !== undefined ? { previous: finding.previous } : {}),
              ...(finding.anchorSize !== undefined
                ? { anchorSize: finding.anchorSize, anchorLiberties: finding.anchorLiberties! }
                : {}),
            },
          });
          used.add(`${game.id}:${before}`);
        }
      }
      board.play(move.color, move.point);
      seen.add(key);
    }
  }
  return [...groups.values()].flat();
}
