import {
  Board,
  PASS,
  POINTS,
  SIZE,
  neighbours,
  opposite,
  pointToHuman,
  type Color,
} from '../domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord, type Move } from '../domain/game.ts';

const EXISTING_STRATEGY_MODULES = [
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

/** Progression intermédiaire : des premiers points au combat du milieu de partie. */
export const BRIDGE_MODULES = [
  {
    id: 'opening-lines',
    level: 2,
    title: 'Premiers coups : coins, côtés et centre',
    lesson:
      'Deux bords aident à délimiter de l’espace dans un coin. En début de partie, la troisième ligne privilégie généralement l’espace proche du bord, la quatrième un développement plus haut. Komoku (3–4), hoshi (4–4) et san-san (3–3) donnent des possibilités différentes ; aucun n’assure un territoire.',
  },
  {
    id: 'corner-enclosure',
    level: 3,
    title: 'Construire un coin : le shimari',
    lesson:
      'Un shimari associe deux pierres du même camp dans un coin. Une forme en saut de cavalier peut dessiner un cadre économique, mais il reste des points d’invasion. Examinez les directions possibles plutôt que de considérer le coin fermé.',
  },
  {
    id: 'side-base',
    level: 4,
    title: 'Étendre ses pierres et bâtir une base',
    lesson:
      'Une extension sur le côté peut laisser plusieurs intersections pour chercher de l’espace et des yeux. Plus elle est large, plus une invasion est envisageable ; plus elle est courte, moins elle exploite l’espace disponible. La proximité adverse et les soutiens déterminent le compromis.',
  },
  {
    id: 'opening-approach',
    level: 4,
    title: 'Aborder un coin et anticiper la réponse',
    lesson:
      'Un kakari remet en question le développement adverse. Avant d’approcher, observez le côté de la pierre, les soutiens proches et l’espace pour une éventuelle base ou sortie. Après l’échange, la direction du prochain coup importe autant que la forme locale.',
  },
  {
    id: 'shape-connection',
    level: 5,
    title: 'Consolider la forme et éviter les coupures',
    lesson:
      'Deux chaînes peuvent partager leurs libertés après une connexion solide. Une connexion réelle n’est pas la même chose qu’un saut de cavalier ou un saut simple : ces relations gardent des espaces qui pourraient être coupés. Comptez les libertés communes et cherchez les points faibles.',
  },
  {
    id: 'central-exit',
    level: 5,
    title: 'Sortir du côté vers le centre',
    lesson:
      'Le saut d’une intersection vers le centre peut créer une voie de développement. Il ne connecte pas encore les pierres et n’établit pas la vie du groupe. Vérifiez où l’adversaire peut couper et où vos autres pierres pourraient servir d’appui.',
  },
  {
    id: 'opening-transition',
    level: 6,
    title: 'Après un échange local : développer le reste du goban',
    lesson:
      'Une séquence locale ne fixe pas le plan global. Quand plusieurs coups se succèdent dans un coin, repérez les autres secteurs et les groupes issus de l’ouverture. Le prochain coup éloigné peut agrandir un cadre, menacer ou renforcer ; il ne prouve pas que l’échange soit terminé.',
  },
  {
    id: 'weak-group',
    level: 6,
    title: 'Du fuseki au combat : renforcer un groupe vulnérable',
    lesson:
      'Le passage au milieu de partie met les structures à l’épreuve. Avant de construire davantage, comptez les libertés de vos chaînes et vérifiez les risques de séparation. Augmenter les libertés améliore une propriété locale, mais ne garantit ni deux yeux ni la survie.',
  },
] as const;

export const STRATEGY_MODULES = [...BRIDGE_MODULES, ...EXISTING_STRATEGY_MODULES] as const;

export const YOSE_STRATEGY_MODULE = {
  id: 'yose-decision',
  level: 9,
  title: 'Choisir le prochain coup de yose',
  lesson:
    'Comparez les gains locaux et l’initiative entre plusieurs secteurs réellement disputés. Le bilan géométrique instantané et l’estimation de KataGo ne prouvent ni le sente, ni le gain final : lisez les réponses et comparez les variantes.',
} as const;
export const STRATEGY_COURSE_MODULES = [...STRATEGY_MODULES, YOSE_STRATEGY_MODULE] as const;
export type StrategyModule = (typeof STRATEGY_COURSE_MODULES)[number]['id'];

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
    resultingSize?: number;
    resultingLiberties?: number;
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
  resultingSize?: number;
  resultingLiberties?: number;
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

function bridgeFindings(board: Board, moves: Move[], before: number, handicap: number): Finding[] {
  const { color, point: p } = moves[before]!;
  if (p === PASS || before > 100) return [];
  const own: number[] = [],
    other: number[] = [];
  for (let q = 0; q < POINTS; q++) {
    if (board.get(q) === color) own.push(q);
    if (board.get(q) === opposite(color)) other.push(q);
  }
  const nearest = (points: number[]) => [...points].sort((a, b) => distance(p, a) - distance(p, b));
  const [px, py] = xy(p);
  const result: Finding[] = [];
  if (
    !handicap &&
    before >= 1 &&
    before <= 6 &&
    corner(p) >= 0 &&
    line(p) >= 3 &&
    1 + Math.min(px, 18 - px) <= 4 &&
    1 + Math.min(py, 18 - py) <= 4 &&
    ![...own, ...other].some((q) => corner(q) === corner(p))
  ) {
    const edgeDistances = [1 + Math.min(px, 18 - px), 1 + Math.min(py, 18 - py)].sort(
      (a, b) => a - b,
    );
    result.push({
      module: 'opening-lines',
      anchors: [],
      prompt:
        'Quel premier point choisir pour développer un coin libre ? Comparez son emplacement avec celui des autres hypothèses.',
      observation: `Le coup ${label(p)} occupe un coin qui ne contenait aucune pierre (secteur 6 × 6). Il se trouve à ${edgeDistances[0]} et ${edgeDistances[1]} lignes des deux bords ; ce sont deux appuis géométriques, pas un territoire déjà conquis.`,
      rubric:
        'Identifier les coins libres et compter les lignes depuis le bord. Expliquer les possibilités de développement le long des deux côtés.',
    });
  }
  if (!handicap && before >= 4 && before <= 28 && corner(p) >= 0 && line(p) >= 3) {
    const sameCorner = own.filter((q) => corner(q) === corner(p));
    const support = sameCorner[0];
    if (
      sameCorner.length === 1 &&
      support !== undefined &&
      line(support) >= 3 &&
      line(support) <= 4 &&
      knight(p, support) &&
      !other.some((q) => corner(q) === corner(p))
    ) {
      result.push({
        module: 'corner-enclosure',
        anchors: [support],
        prompt:
          'Comment associer les deux pierres pour esquisser un cadre de coin ? Cherchez aussi les faiblesses que pourrait exploiter une invasion.',
        observation: `Avant ${label(p)}, seule la pierre amie ${label(support)} occupe ce secteur de coin. Les deux pierres forment un saut de cavalier ; elles ne sont pas solidement connectées et le cadre reste ouvert.`,
        rubric:
          'Repérer le saut de cavalier et les espaces non fermés. Comparer une esquisse de coin aux autres développements possibles.',
      });
    }
  }
  if (
    before >= 6 &&
    before <= 65 &&
    line(p) >= 3 &&
    line(p) <= 4 &&
    !other.some((q) => distance(q, p) <= 1)
  ) {
    const support = nearest(own).find((q) => {
      const [x, y] = xy(q);
      const d = distance(p, q);
      if (
        side(q) !== side(p) ||
        line(q) !== line(p) ||
        (x !== px && y !== py) ||
        d < 3 ||
        d > 5 ||
        (corner(q) >= 0 && corner(p) >= 0)
      )
        return false;
      const step = x === px ? Math.sign(py - y) * SIZE : Math.sign(px - x);
      return Array.from({ length: d - 1 }, (_, i) => q + step * (i + 1)).every(
        (i) => !board.get(i),
      );
    });
    if (support !== undefined) {
      result.push({
        module: 'side-base',
        anchors: [support],
        prompt:
          'Où étendre cette pierre pour garder de la place sur le côté ? Cherchez les espaces où l’adversaire pourrait s’interposer.',
        observation: `Avec ${label(p)}, le kifu laisse ${distance(p, support) - 1} intersections vides entre ce point et ${label(support)}, sur la même ligne ${line(p)}. Ce vide offre de l’espace mais demeure contestable ; il ne prouve pas une base vivante.`,
        rubric:
          'Compter la largeur de l’extension, rechercher les coupures et comparer le volume d’espace avec le risque de séparation.',
      });
    }
  }
  if (!handicap && before >= 4 && before <= 30 && corner(p) >= 0) {
    const approached = nearest(other).find(
      (q) => corner(q) === corner(p) && knight(p, q) && line(q) >= 3 && line(q) <= 4,
    );
    if (approached !== undefined && !own.some((q) => corner(q) === corner(p))) {
      result.push({
        module: 'opening-approach',
        anchors: [approached],
        prompt:
          'Comment approcher la pierre adverse de ce coin ? Anticipez une réponse et la direction dans laquelle vous pourriez vous développer.',
        observation: `Le coup ${label(p)} est en saut de cavalier par rapport à ${label(approached)}, et aucune pierre amie ne se trouvait dans ce secteur avant le coup. L’approche conteste l’espace sans démontrer une menace forcée.`,
        rubric:
          'Rechercher des soutiens voisins, imaginer une réponse adverse et trouver une voie de sortie. Examiner ensuite les coups réellement joués.',
      });
    }
  }
  const after = board.clone();
  if (after.play(color, p).illegal) return result;
  const groups = new Map<number, number>();
  for (const q of neighbours(p))
    if (board.get(q) === color) {
      const chain = board.stonesOf(q);
      groups.set(Math.min(...chain), q);
    }
  if (before >= 12 && before <= 85 && groups.size >= 2) {
    const anchors = [...groups.values()];
    const size = after.stonesOf(p).length,
      liberties = after.libertyCount(p);
    result.push({
      module: 'shape-connection',
      anchors,
      resultingSize: size,
      resultingLiberties: liberties,
      prompt:
        'Quel coup réunit les chaînes repérées, et vaut-il mieux les relier maintenant que développer un autre secteur ?',
      observation: `Le coup ${label(p)} connecte ${anchors.length} chaînes distinctes. La chaîne résultante compte ${size} pierres et ${liberties} libertés. Ni la vie ni l’efficacité stratégique ne sont déduites de cette seule connexion.`,
      rubric:
        'Identifier les chaînes distinctes, le point liant et leurs libertés après la pose. Comparer le bénéfice de ce renforcement à une autre décision.',
    });
  }
  if (before >= 14 && before <= 85 && line(p) >= 5) {
    const support = nearest(own).find((q) => {
      const [x, y] = xy(q);
      return (
        line(q) >= 3 &&
        line(p) - line(q) === 2 &&
        distance(q, p) === 2 &&
        (x === px || y === py) &&
        !board.get((q + p) / 2) &&
        !neighbours(p).some((r) => board.get(r) === color)
      );
    });
    if (support !== undefined) {
      result.push({
        module: 'central-exit',
        anchors: [support],
        prompt:
          'Comment développer la pierre repérée vers l’intérieur du goban sans négliger une coupure éventuelle ?',
        observation: `${label(p)} est plus loin du bord de deux lignes que ${label(support)}, exactement à un saut rectiligne d’une intersection ; le point intermédiaire ${label((p + support) / 2)} est vide. Les pierres ne sont pas directement reliées.`,
        rubric:
          'Tracer le saut et repérer le point vulnérable. Chercher une autre pierre d’appui si l’adversaire coupe.',
      });
    }
  }
  if (before >= 12 && before <= 70) {
    const prior = moves.slice(before - 3, before);
    const last = prior[2]!.point;
    if (
      last !== PASS &&
      corner(last) >= 0 &&
      prior.every((m) => m.point !== PASS && corner(m.point) === corner(last)) &&
      distance(p, last) >= 8 &&
      nearest(own).some((q) => distance(p, q) <= 4)
    ) {
      result.push({
        module: 'opening-transition',
        anchors: [last],
        prompt:
          'Après ces trois échanges dans un coin, quelle nouvelle zone travailler ? Vérifiez ce qu’on laisse derrière soi avant de changer de secteur.',
        observation: `Les coups ${before - 2}, ${before - 1} et ${before} appartiennent au même secteur de coin. Le coup suivant, ${label(p)}, se trouve à ${distance(p, last)} intersections orthogonales du dernier coup et à quatre ou moins d’une pierre amie. Il change de secteur ; l’échange local n’est pas déclaré résolu.`,
        rubric:
          'Observer les formes du coin, rechercher les menaces qui restent et les soutiens dans les autres secteurs. Rejouer la continuation plutôt que mémoriser un ordre universel.',
      });
    }
  }
  if (before >= 20 && before <= 100) {
    const support = [...groups.values()].find(
      (q) =>
        board.stonesOf(q).length >= 2 &&
        board.libertyCount(q) >= 2 &&
        board.libertyCount(q) <= 3 &&
        after.libertyCount(p) >= board.libertyCount(q) + 2,
    );
    if (support !== undefined) {
      const size = board.stonesOf(support).length,
        liberties = board.libertyCount(support);
      const resultingSize = after.stonesOf(p).length,
        resultingLiberties = after.libertyCount(p);
      result.push({
        module: 'weak-group',
        anchors: [support],
        anchorSize: size,
        anchorLiberties: liberties,
        resultingSize,
        resultingLiberties,
        prompt:
          'Ce groupe a peu de libertés. Faut-il le consolider avant de développer ailleurs ? Comptez les libertés avant et après le coup envisagé.',
        observation: `La chaîne de ${label(support)} contient ${size} pierres et ${liberties} libertés. Après ${label(p)}, la chaîne reliée contient ${resultingSize} pierres et ${resultingLiberties} libertés. L'amélioration est vérifiable, sans conclusion automatique sur sa vie.`,
        rubric:
          'Compter les libertés sans les compter deux fois, identifier le renforcement et rechercher la prochaine menace. Comparer la priorité avec une autre hypothèse.',
      });
    }
  }
  return result;
}

/** Build authentic case studies from exact legal kifu prefixes. No score or optimality is inferred. */
export function extractStrategyCourse(games: readonly GameRecord[], quota = 12): StrategyLesson[] {
  const historic = extractFindings(games, quota, EXISTING_STRATEGY_MODULES, findings, new Set());
  const occupied = new Set(historic.map((l) => `${l.gameId}:${l.before}`));
  return [...historic, ...extractFindings(games, quota, BRIDGE_MODULES, bridgeFindings, occupied)];
}

/** Additional cases after the initial opening; same factual detectors, no rank assumptions. */
export const MIDDLE_STUDY_MODULES = EXISTING_STRATEGY_MODULES.filter(
  (m) =>
    m.id === 'direction' || m.id === 'influence' || m.id === 'reduction' || m.id === 'initiative',
);
export function extractMiddleGameStudies(
  games: readonly GameRecord[],
  quota = 30,
): StrategyLesson[] {
  const modules = new Set<StrategyModule>(MIDDLE_STUDY_MODULES.map((m) => m.id));
  return extractFindings(
    games,
    quota,
    MIDDLE_STUDY_MODULES,
    (board, moves, before, handicap) =>
      before >= 35
        ? findings(board, moves, before, handicap).filter((f) => modules.has(f.module))
        : [],
    new Set(),
  );
}

function extractFindings(
  games: readonly GameRecord[],
  quota: number,
  modules: readonly { id: StrategyModule }[],
  finder: typeof findings,
  used: Set<string>,
): StrategyLesson[] {
  const count = Math.max(0, Math.min(30, Math.floor(quota)));
  const groups = new Map<StrategyModule, StrategyLesson[]>(modules.map((m) => [m.id, []]));
  const historical = games.filter((g) => !g.imported && !g.rengo && g.sources.length > 0);
  // Fixed permutation interleaves the corpus rather than concentrating on the earliest games.
  const ordered = [...historical].sort((a, b) => a.id.localeCompare(b.id));
  const stride = Math.max(1, Math.ceil(ordered.length / Math.max(1, count)));
  const interleaved = Array.from({ length: stride }, (_, offset) =>
    ordered.filter((_, i) => i % stride === offset),
  ).flat();
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
        for (const finding of finder(board, moves, before, game.handicap)) {
          const group = groups.get(finding.module)!;
          if (
            group.length >= count ||
            (finding.module === 'opening-lines' && before !== 1 + (group.length % 3)) ||
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
              ...(finding.resultingSize !== undefined
                ? {
                    resultingSize: finding.resultingSize,
                    resultingLiberties: finding.resultingLiberties!,
                  }
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
