import { Board, PASS, POINTS, neighbours, opposite, pointToHuman, type Color } from './board.ts';
import { boardAt, decodeMoves, decodePoints, type GameRecord } from './game.ts';

export const SCHOOL_MODULES = [
  {
    id: 'liberties',
    level: 1,
    title: 'Compter les libertés',
    lesson:
      'Partez de la pierre indiquée et suivez les lignes jusqu’aux pierres de même couleur qui lui sont reliées. Pour toute cette chaîne, comptez les intersections vides juste au-dessus, en dessous, à gauche ou à droite. Ne comptez pas les diagonales. Si deux pierres touchent le même point vide, comptez-le une seule fois.',
  },
  {
    id: 'capture-one',
    level: 1,
    title: 'Capturer une pierre',
    lesson:
      'Lorsque toutes ses libertés disparaissent, une pierre adverse est retirée avant de vérifier les libertés du coup joué. Une pierre en atari n’en a plus qu’une.',
  },
  {
    id: 'capture-chain',
    level: 1,
    title: 'Capturer une chaîne',
    lesson:
      'Les pierres connectées partagent leurs libertés : fermer la dernière retire toute la chaîne, quelle que soit sa taille.',
  },
  {
    id: 'escape',
    level: 2,
    title: 'Sortir de l’atari',
    lesson:
      'Une chaîne menacée peut s’étendre, se connecter ou capturer. Ne comptez pas seulement les libertés du nouveau point : comptez celles du groupe après le coup.',
  },
  {
    id: 'connect',
    level: 2,
    title: 'Connecter des groupes',
    lesson:
      'Réunir des groupes séparés permet de partager leurs libertés. Une connexion utile doit aussi éviter de mettre le groupe réuni en atari.',
  },
  {
    id: 'atari',
    level: 2,
    title: 'Mettre en atari',
    lesson:
      'Retirer l’avant-dernière liberté force l’adversaire à décider s’il faut répondre. Un atari n’est pas toujours la meilleure stratégie globale.',
  },
  {
    id: 'double-atari',
    level: 3,
    title: 'Créer un double atari',
    lesson:
      'Un même coup peut menacer deux chaînes adverses distinctes. Vérifiez qu’elles ont chacune une seule liberté après le coup ; cela ne garantit pas nécessairement une capture.',
  },
  {
    id: 'capture-sequence',
    level: 3,
    title: 'Lire une capture en trois coups',
    lesson:
      'Ne vous arrêtez pas au premier atari : lisez une défense adverse, puis vérifiez si la capture reste forcée. Ici, toutes les réponses légales sont vérifiées à un horizon de trois demi-coups.',
  },
  {
    id: 'legality',
    level: 3,
    title: 'Ko et coups interdits',
    lesson:
      'Un coup sans liberté est interdit sauf s’il capture. Le ko simple interdit une reprise immédiate qui recréerait la position précédente. Une autre action doit intervenir avant cette reprise.',
  },
  {
    id: 'region-border',
    level: 4,
    title: 'Reconnaître la bordure d’une zone vide',
    lesson:
      'Partez du point marqué et suivez les lignes de point vide en point vide, sans traverser de pierre. La bordure est formée par les pierres qui touchent directement cette zone. Le bord du goban arrête la zone ; il n’a pas de couleur. Une bordure d’une seule couleur ne suffit pas à établir un territoire.',
  },
  {
    id: 'region-size',
    level: 4,
    title: 'Compter les points d’une zone vide',
    lesson:
      'Comptez le point marqué, puis tous les points vides qu’on peut atteindre en suivant les lignes sans traverser de pierre. Chaque point compte une fois. Il s’agit de la taille de la zone dans la position affichée, pas de sa valeur au décompte final.',
  },
] as const;
export type ModuleId = (typeof SCHOOL_MODULES)[number]['id'];
export interface SchoolExercise {
  id: string;
  module: ModuleId;
  gameId: string;
  before: number;
  color: Color;
  /** Pierres désignées dans la position réelle, pas des pierres ajoutées. */
  anchors: number[];
  /** Point demandé pour une question de légalité ; sinon le coup du kifu sert d’exemple. */
  candidate?: number;
}
export type SchoolAnswer = number | boolean;
export const isMoveModule = (id: ModuleId): boolean =>
  id !== 'liberties' && id !== 'legality' && id !== 'region-border' && id !== 'region-size';
export const schoolPosition = (game: GameRecord, before: number) =>
  boardAt(decodePoints(game.setupBlack), decodeMoves(game.moves), before);

function connected(board: Board, anchors: readonly number[]): boolean {
  const group = board.stonesOf(anchors[0]!);
  return anchors.every((point) => group.includes(point));
}

/** Cherche la dernière liberté commune et contrôle que le coup capture légalement le groupe. */
export function finishingCapture(board: Board, color: Color, target: number): number | null {
  if (board.get(target) !== opposite(color) || board.libertyCount(target) !== 1) return null;
  const liberty = board
    .stonesOf(target)
    .flatMap(neighbours)
    .find((p) => board.get(p) === null);
  if (liberty === undefined) return null;
  const result = board.clone().play(color, liberty);
  return !result.illegal && result.captures.includes(target) ? liberty : null;
}

export interface CaptureDefense {
  reply: number;
  finish: number;
  groupSize: number;
}
/** Preuve bornée : un premier coup, toutes les réponses adverses légales (passe comprise), puis capture. */
export function captureProof(
  board: Board,
  color: Color,
  target: number,
  first: number,
): CaptureDefense[] | null {
  if (
    first < 0 ||
    first >= POINTS ||
    !Number.isInteger(first) ||
    board.get(target) !== opposite(color) ||
    board.libertyCount(target) !== 2
  )
    return null;
  const attacking = board.clone();
  if (attacking.play(color, first).illegal || attacking.libertyCount(target) !== 1) return null;
  const results: CaptureDefense[] = [];
  for (let reply = PASS; reply < POINTS; reply++) {
    const defending = attacking.clone();
    if (defending.play(opposite(color), reply).illegal) continue;
    const finish = finishingCapture(defending, color, target);
    if (finish === null) return null;
    results.push({ reply, finish, groupSize: defending.stonesOf(target).length });
  }
  return results;
}

/** Every proved first move, with a legal example of the strongest extension. */
export function captureSequenceSolutions(board: Board, ex: SchoolExercise) {
  if (ex.module !== 'capture-sequence') return [];
  const target = ex.anchors[0]!;
  return chainLiberties(board, target).flatMap((first) => {
    const proof = captureProof(board, ex.color, target, first);
    if (!proof?.length) return [];
    const defense = [...proof].sort((a, b) => b.groupSize - a.groupSize || a.reply - b.reply)[0]!;
    return [{ first, defense, replies: proof.length }];
  });
}

export function emptyRegion(board: Board, start: number): { points: number[]; border: Set<Color> } {
  if (board.get(start) !== null) return { points: [], border: new Set() };
  const points = [start],
    seen = new Set([start]),
    border = new Set<Color>();
  for (let i = 0; i < points.length; i++)
    for (const p of neighbours(points[i]!)) {
      const color = board.get(p);
      if (color) border.add(color);
      else if (!seen.has(p)) {
        seen.add(p);
        points.push(p);
      }
    }
  return { points, border };
}

/** Distinct empty intersections adjacent to the complete connected chain. */
export function chainLiberties(board: Board, anchor: number): number[] {
  return [
    ...new Set(
      board
        .stonesOf(anchor)
        .flatMap(neighbours)
        .filter((p) => board.get(p) === null),
    ),
  ].sort((a, b) => a - b);
}

/** Correction only: never reveal the answers before the learner completes the question. */
export function countingSolutionPoints(board: Board, ex: SchoolExercise): number[] {
  if (ex.module === 'liberties') return chainLiberties(board, ex.anchors[0]!);
  if (ex.module === 'region-size' || ex.module === 'region-border')
    return emptyRegion(board, ex.candidate!).points;
  return [];
}

export function exerciseAnswer(board: Board, ex: SchoolExercise, answer: SchoolAnswer): boolean {
  if (ex.module === 'region-size')
    return typeof answer === 'number' && answer === emptyRegion(board, ex.candidate!).points.length;
  if (ex.module === 'region-border') {
    const { border } = emptyRegion(board, ex.candidate!);
    return answer === (border.size === 2 ? 3 : border.has('B') ? 1 : 2);
  }
  if (ex.module === 'liberties')
    return typeof answer === 'number' && answer === board.libertyCount(ex.anchors[0]!);
  if (ex.module === 'legality')
    return (
      typeof answer === 'boolean' && answer === !board.clone().play(ex.color, ex.candidate!).illegal
    );
  if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= POINTS)
    return false;
  if (ex.module === 'capture-sequence')
    return captureProof(board, ex.color, ex.anchors[0]!, answer) !== null;
  const next = board.clone();
  const result = next.play(ex.color, answer);
  if (result.illegal) return false;
  switch (ex.module) {
    case 'capture-one':
    case 'capture-chain':
      return ex.anchors.every((point) => result.captures.includes(point));
    case 'escape':
      return next.get(ex.anchors[0]!) === ex.color && next.libertyCount(ex.anchors[0]!) >= 2;
    case 'connect':
      return connected(next, ex.anchors) && next.libertyCount(ex.anchors[0]!) >= 2;
    case 'atari':
    case 'double-atari':
      return ex.anchors.every(
        (point) => next.get(point) === opposite(ex.color) && next.libertyCount(point) === 1,
      );
  }
}

const pointsLabel = (points: readonly number[]) => points.map(pointToHuman).join(', ');
export function schoolQuestion(board: Board, ex: SchoolExercise, game?: GameRecord): string {
  const stones = pointsLabel(ex.anchors);
  const player = ex.color === 'B' ? 'Noir' : 'Blanc';
  switch (ex.module) {
    case 'region-border':
      return `Quelles pierres touchent la zone vide qui part de ${pointToHuman(ex.candidate!)} : des pierres noires, blanches ou des deux couleurs ?`;
    case 'region-size':
      return `Combien de points vides compte la zone qui part de ${pointToHuman(ex.candidate!)} ? Comptez aussi ce point (marqué « ? »), une seule fois.`;
    case 'liberties':
      return `Combien de libertés a la chaîne qui contient la pierre en ${pointToHuman(ex.anchors[0]!)} ?`;
    case 'capture-one':
      return `Capturez la pierre adverse en ${stones}. ${player} au trait.`;
    case 'capture-chain':
      return `Capturez la chaîne contenant ${pointToHuman(ex.anchors[0]!)}. Elle compte ${board.stonesOf(ex.anchors[0]!).length} pierres. ${player} au trait.`;
    case 'escape':
      return `Sauvez le groupe en ${stones} : il doit avoir au moins deux libertés après votre coup. ${player} au trait.`;
    case 'connect':
      return `Reliez les groupes désignés en ${stones} en un seul groupe possédant au moins deux libertés. ${player} au trait.`;
    case 'atari':
      return `Mettez le groupe en ${stones} en atari, sans le capturer maintenant. ${player} au trait.`;
    case 'double-atari':
      return `Mettez simultanément les deux groupes en ${stones} en atari, sans les capturer. ${player} au trait.`;
    case 'capture-sequence':
      return `Forcez la capture du groupe en ${stones} en trois demi-coups (votre coup, sa défense, votre capture). ${player} au trait.`;
    case 'legality': {
      if (!game || game.id !== ex.gameId || ex.before < 1)
        throw new Error('La question de légalité exige le dernier coup du kifu.');
      const last = decodeMoves(game.moves)[ex.before - 1]!;
      const prior = schoolPosition(game, ex.before - 1);
      const { captures } = prior.play(last.color, last.point);
      const previousPlayer = last.color === 'B' ? 'Noir' : 'Blanc';
      const action = last.point === PASS ? 'a passé' : `a joué en ${pointToHuman(last.point)}`;
      const capture = captures.length
        ? ` et a capturé ${captures.length === 1 ? 'la pierre' : 'les pierres'} en ${pointsLabel(captures)}`
        : ' sans capturer de pierre';
      return `Au dernier coup (n°${ex.before}), ${previousPlayer} ${action}${capture}. Aucun coup n’a été joué depuis. ${player} peut-il maintenant jouer légalement en ${pointToHuman(ex.candidate!)} (règle du ko simple) ?`;
    }
  }
}

export function schoolSolution(
  board: Board,
  ex: SchoolExercise,
  historical: number,
  chosen?: SchoolAnswer,
): string {
  if (ex.module === 'region-border' || ex.module === 'region-size') {
    const { points, border } = emptyRegion(board, ex.candidate!);
    const count = points.length === 1 ? '1 point vide' : `${points.length} points vides`;
    const boundary =
      border.size === 2
        ? 'La zone touche des pierres des deux couleurs.'
        : border.has('B')
          ? 'La zone ne touche que des pierres noires.'
          : border.has('W')
            ? 'La zone ne touche que des pierres blanches.'
            : 'La zone ne touche aucune pierre.';
    return `La zone contient ${count} : ${pointsLabel([...points].sort((a, b) => a - b))}. ${boundary} Ce constat ne détermine pas le territoire final.`;
  }
  if (ex.module === 'liberties') {
    const liberties = chainLiberties(board, ex.anchors[0]!);
    const count = liberties.length === 1 ? '1 liberté' : `${liberties.length} libertés`;
    return `La chaîne qui contient ${pointToHuman(ex.anchors[0]!)} a ${count} : ${pointsLabel(liberties)}.`;
  }
  if (ex.module === 'capture-sequence') {
    const solutions = captureSequenceSolutions(board, ex);
    const example = solutions.find((solution) => solution.first === chosen) ?? solutions[0];
    if (!example) throw new Error('Séquence de capture sans preuve.');
    const line = [example.first, example.defense.reply, example.defense.finish]
      .map((point, i) => `${ex.before + i + 1}. ${pointToHuman(point)}`)
      .join(' · ');
    return `Premier(s) coup(s) correct(s) : ${pointsLabel(solutions.map((solution) => solution.first))}. Exemple de variante vérifiée : ${line}. Les ${example.replies} réponses adverses légales à ce premier coup ont été vérifiées ; cette preuve locale ne constitue pas un verdict général de vie et mort.`;
  }
  if (ex.module === 'legality') {
    const result = board.clone().play(ex.color, ex.candidate!);
    return result.illegal === 'ko'
      ? 'Non : la reprise immédiate recréerait la position précédente (ko simple).'
      : result.illegal === 'suicide'
        ? 'Non : le groupe n’aurait aucune liberté et ne capture rien.'
        : result.illegal === 'occupied'
          ? 'Non : cette intersection est déjà occupée.'
          : 'Oui : le coup respecte le ko et laisse une chaîne avec au moins une liberté après les captures éventuelles.';
  }
  const validChoice = typeof chosen === 'number' && exerciseAnswer(board, ex, chosen);
  const p = validChoice ? (chosen as number) : historical;
  const next = board.clone();
  const result = next.play(ex.color, p);
  const prefix =
    validChoice && p !== historical
      ? `Votre coup ${pointToHuman(p)} satisfait l’objectif. Dans la partie, le coup enregistré est ${pointToHuman(historical)}.`
      : `Le kifu montre ${pointToHuman(historical)} au coup ${ex.before + 1}.`;
  switch (ex.module) {
    case 'capture-one':
    case 'capture-chain':
      return `${prefix} Il retire ${result.captures.length} pierre(s) en fermant la dernière liberté de la chaîne.`;
    case 'escape':
    case 'connect':
      return `${prefix} Le groupe concerné possède maintenant ${next.libertyCount(ex.anchors[0]!)} libertés.`;
    case 'atari':
    case 'double-atari':
      return `${prefix} Chaque groupe désigné conserve exactement une liberté.`;
  }
}

/** Fenêtre locale de 9 à 19 lignes, toujours issue du vrai goban, avec une ligne de marge. */
export function schoolWindow(
  board: Board,
  ex: Pick<SchoolExercise, 'anchors' | 'candidate'>,
): { x: number; y: number; size: number } {
  const marked = [
    ...new Set(ex.anchors.flatMap((p) => (board.stonesOf(p).length ? board.stonesOf(p) : [p]))),
  ];
  if (ex.candidate !== undefined) marked.push(ex.candidate);
  if (!marked.length) return { x: 0, y: 0, size: 19 };
  const xs = marked.map((p) => p % 19),
    ys = marked.map((p) => Math.floor(p / 19));
  const size = Math.min(
    19,
    Math.max(9, Math.max(...xs) - Math.min(...xs) + 3, Math.max(...ys) - Math.min(...ys) + 3),
  );
  const center = (v: number[]) =>
    Math.max(0, Math.min(19 - size, Math.floor((Math.min(...v) + Math.max(...v) - size + 1) / 2)));
  return { x: center(xs), y: center(ys), size };
}

/** Différentes chaînes voisines d'un point, représentées par le point le plus petit. */
function adjacentGroups(board: Board, point: number, color: Color): number[] {
  return [
    ...new Set(
      neighbours(point)
        .filter((p) => board.get(p) === color)
        .map((p) => Math.min(...board.stonesOf(p))),
    ),
  ];
}

/** Extraction des objectifs locaux à partir des coups historiques ; jamais de mise en place fictive. */
export function extractSchools(games: readonly GameRecord[], quota = 24): SchoolExercise[] {
  const buckets = new Map<ModuleId, SchoolExercise[]>(SCHOOL_MODULES.map(({ id }) => [id, []]));
  const keys = new Set<string>();
  const legalityCounts = { ko: 0, suicide: 0, legal: 0 };
  const libertyCounts = new Map<number, number>();
  const regionCounts = new Map<number, number>();
  const borderCounts = { B: 0, W: 0, mixed: 0 };
  function add(
    module: ModuleId,
    game: GameRecord,
    before: number,
    color: Color,
    anchors: number[],
    board: Board,
    historical: number,
    candidate?: number,
  ) {
    const bucket = buckets.get(module)!;
    const key = `${module}:${game.id}`;
    if (bucket.length >= quota || keys.has(key)) return false;
    const ex: SchoolExercise = {
      id: `${module}:${game.id}:${before}`,
      module,
      gameId: game.id,
      before,
      color,
      anchors,
      ...(candidate === undefined ? {} : { candidate }),
    };
    if (isMoveModule(module) && !exerciseAnswer(board, ex, historical))
      throw new Error(`Objectif invalide ${ex.id}`);
    if (schoolWindow(board, ex).size > 11) return false;
    bucket.push(ex);
    keys.add(key);
    return true;
  }
  const historicalGames = games.filter((game) => !game.imported && !game.rengo);
  // Échantillonnage sur toute la chronologie, puis davantage de parties pour les motifs rares.
  const stride = Math.max(1, Math.ceil(historicalGames.length / quota));
  const ordered = Array.from({ length: stride }, (_, offset) =>
    historicalGames.filter((_, i) => i % stride === offset),
  ).flat();
  for (const game of ordered) {
    const moves = decodeMoves(game.moves);
    let board = new Board();
    for (const point of decodePoints(game.setupBlack)) board.setup(point, 'B');
    for (let before = 0; before < moves.length; before++) {
      const move = moves[before]!;
      const next = board.clone();
      const play = next.play(move.color, move.point);
      if (play.illegal) break;
      if (before >= 8 && before <= 180 && move.point !== PASS) {
        const enemy = opposite(move.color);
        const allies = adjacentGroups(board, move.point, move.color);
        const enemies = adjacentGroups(board, move.point, enemy);
        const liberty = [...allies, ...enemies].find((p) => {
          const n = board.libertyCount(p);
          return n >= 1 && n <= 6 && (libertyCounts.get(n) ?? 0) < Math.ceil(quota / 6);
        });
        if (
          liberty !== undefined &&
          add('liberties', game, before, move.color, [liberty], board, move.point)
        ) {
          const n = board.libertyCount(liberty);
          libertyCounts.set(n, (libertyCounts.get(n) ?? 0) + 1);
        }
        const captured = enemies.filter((p) => play.captures.includes(p));
        for (const target of captured)
          add(
            board.stonesOf(target).length === 1 ? 'capture-one' : 'capture-chain',
            game,
            before,
            move.color,
            [target],
            board,
            move.point,
          );
        const escape = allies.find((p) => board.libertyCount(p) === 1 && next.libertyCount(p) >= 2);
        if (escape !== undefined)
          add('escape', game, before, move.color, [escape], board, move.point);
        if (allies.length >= 2 && next.libertyCount(move.point) >= 2)
          add('connect', game, before, move.color, allies, board, move.point);
        const ataris = enemies.filter(
          (p) => board.libertyCount(p) >= 2 && next.get(p) === enemy && next.libertyCount(p) === 1,
        );
        if (ataris.length >= 1)
          add('atari', game, before, move.color, [ataris[0]!], board, move.point);
        if (ataris.length >= 2)
          add('double-atari', game, before, move.color, ataris.slice(0, 2), board, move.point);
        // Position réelle et premier coup du kifu ; toutes les défenses suivantes sont prouvées.
        // Si la suite historique ne démontre pas la défense, la vue l'indique comme variante.
        if ((buckets.get('capture-sequence')?.length ?? quota) < quota) {
          for (const target of ataris) {
            if (board.libertyCount(target) !== 2) continue;
            const proof = captureProof(board, move.color, target, move.point);
            if (
              proof?.some((d) => d.groupSize > board.stonesOf(target).length) &&
              add('capture-sequence', game, before, move.color, [target], board, move.point)
            )
              break;
          }
        }
        // Positions tirées du kifu, avec un mélange de coups permis et interdits.
        const last = moves[before - 1]!;
        if (
          last.point !== PASS &&
          last.color !== move.color &&
          board.get(last.point) === last.color
        ) {
          const points = neighbours(last.point).filter((p) => board.get(p) === null);
          for (const p of points) {
            const trial = board.clone().play(move.color, p);
            const type =
              trial.illegal === 'ko' ? 'ko' : trial.illegal === 'suicide' ? 'suicide' : 'legal';
            const limit =
              type === 'legal' ? quota - 2 * Math.floor(quota / 4) : Math.floor(quota / 4);
            // Les coups légaux du test sont uniquement des coups qui capturent ou joignent une chaîne.
            if (
              type === 'legal' &&
              (trial.illegal ||
                (!trial.captures.length && adjacentGroups(board, p, move.color).length < 2))
            )
              continue;
            if (
              legalityCounts[type] < limit &&
              add('legality', game, before, move.color, [last.point], board, move.point, p)
            ) {
              legalityCounts[type]++;
              break;
            }
          }
        }
      }
      if (
        before >= 100 &&
        move.point !== PASS &&
        ((buckets.get('region-border')?.length ?? quota) < quota ||
          (buckets.get('region-size')?.length ?? quota) < quota)
      ) {
        const region = emptyRegion(board, move.point);
        if (region.points.length >= 1 && region.points.length <= 6 && region.border.size >= 1) {
          const kind = region.border.size === 2 ? 'mixed' : region.border.has('B') ? 'B' : 'W';
          if (
            borderCounts[kind] < Math.ceil(quota / 3) &&
            add(
              'region-border',
              game,
              before,
              move.color,
              region.points,
              board,
              move.point,
              move.point,
            )
          )
            borderCounts[kind]++;
          const n = region.points.length;
          if (
            region.border.size === 1 &&
            (regionCounts.get(n) ?? 0) < Math.ceil(quota / 6) &&
            add(
              'region-size',
              game,
              before,
              move.color,
              region.points,
              board,
              move.point,
              move.point,
            )
          )
            regionCounts.set(n, (regionCounts.get(n) ?? 0) + 1);
        }
      }
      board = next;
    }
    if ([...buckets.values()].every((b) => b.length >= quota)) break;
  }
  return SCHOOL_MODULES.flatMap(({ id }) => buckets.get(id)!);
}
