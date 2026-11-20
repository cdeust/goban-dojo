import { Board, PASS, POINTS, SIZE, neighbours, type Color } from '../domain/board.ts';
import { afterCandidate } from './analysis.ts';
import type { EnginePosition } from './features.ts';

// Leela Zero, Network::gather_features et FastBoard::move_to_text_sgf.
// https://github.com/leela-zero/leela-zero/blob/master/src/Network.cpp
const HISTORY = 8;
export const ZERO_KOMI = 7.5;
// Sur s007, le tanh WASM a renvoyé la première valeur float32 au-delà de 1.
const FLOAT32_ULP_AT_ONE = 2 ** -23;

/** Les lignes du tenseur natif partent de A1, celles du kifu de A19. */
function netIndex(point: number): number {
  if (point === PASS) return POINTS;
  return (SIZE - 1 - Math.floor(point / SIZE)) * SIZE + (point % SIZE);
}

function replay(position: EnginePosition, visit: (board: Board, ply: number) => void): Board {
  const board = new Board();
  for (const p of position.setupBlack) board.setup(p, 'B');
  visit(board, 0);
  position.moves.forEach(({ color, point }, i) => {
    board.play(color, point);
    visit(board, i + 1);
  });
  return board;
}

export function encodeZeroPosition(position: EnginePosition): Float32Array {
  const planes = new Float32Array((2 * HISTORY + 2) * POINTS);
  replay(position, (board, ply) => {
    const age = position.moves.length - ply;
    if (age >= HISTORY) return;
    for (let p = 0; p < POINTS; p++) {
      const stone = board.get(p);
      if (stone) planes[(age + (stone === position.next ? 0 : HISTORY)) * POINTS + netIndex(p)] = 1;
    }
  });
  const turnPlane = 2 * HISTORY + (position.next === 'B' ? 0 : 1);
  planes.fill(1, turnPlane * POINTS, (turnPlane + 1) * POINTS);
  return planes;
}

export interface ZeroChoice {
  point: number;
  visits: number;
  /** Moyenne des probabilités de victoire noire des feuilles visitées. */
  blackWin: number;
  /** Suite des enfants les plus visités, au format du kifu. */
  line: number[];
}

export interface ZeroResult {
  visits: number;
  choices: ZeroChoice[];
}

interface Inference {
  /** Logits bruts du réseau en coordonnées natives, puis la passe. */
  policy: Float32Array;
  /** Valeur tanh pour le joueur au trait. */
  value: number;
}

type Infer = (position: EnginePosition) => Promise<Inference>;

interface State {
  board: Board;
  seen: Set<string>;
}

function rootState(position: EnginePosition): State {
  const seen = new Set<string>();
  const board = replay(position, (board) => seen.add(board.positionKey()));
  return { board, seen };
}

function finished({ moves }: EnginePosition): boolean {
  return moves.at(-1)?.point === PASS && moves.at(-2)?.point === PASS;
}

function legalMove({ board, seen }: State, side: Color, point: number): boolean {
  if (point === PASS) return true;
  if (!Number.isInteger(point) || point < 0 || point >= POINTS || board.get(point)) return false;
  const child = board.clone();
  return !child.play(side, point).illegal && !seen.has(child.positionKey());
}

export function isLegalZeroMove(position: EnginePosition, point: number): boolean {
  return !finished(position) && legalMove(rootState(position), position.next, point);
}

/** Décompte Tromp–Taylor après deux passes, sur les pierres encore en jeu. */
function terminalBlackWin(board: Board, handicap: number): number {
  let lead = -ZERO_KOMI - handicap;
  const counted = new Uint8Array(POINTS);
  for (let p = 0; p < POINTS; p++) {
    const stone = board.get(p);
    if (stone) {
      lead += stone === 'B' ? 1 : -1;
      continue;
    }
    if (counted[p]) continue;
    const region = [p];
    counted[p] = 1;
    let black = false,
      white = false;
    for (let i = 0; i < region.length; i++) {
      for (const q of neighbours(region[i]!)) {
        const border = board.get(q);
        if (border === 'B') black = true;
        else if (border === 'W') white = true;
        else if (!counted[q]) {
          counted[q] = 1;
          region.push(q);
        }
      }
    }
    if (black !== white) lead += black ? region.length : -region.length;
  }
  return lead > 0 ? 1 : lead < 0 ? 0 : 0.5;
}

interface Edge {
  point: number;
  prior: number;
  visits: number;
  blackSum: number;
  child?: Node;
}

interface Node extends State {
  position: EnginePosition;
  edges: Edge[];
  /** Sortie du réseau avant les simulations, ou résultat exact après deux passes. */
  blackWin: number;
  visits: number;
  visitedPrior: number;
}

async function expand(
  position: EnginePosition,
  state: State,
  infer: Infer,
  excluded?: ReadonlySet<number>,
): Promise<Node> {
  const node: Node = { ...state, position, edges: [], visits: 0, blackWin: 0, visitedPrior: 0 };
  if (finished(position)) {
    node.blackWin = terminalBlackWin(node.board, position.setupBlack.length);
    return node;
  }
  const points: number[] = [];
  for (let action = 0; action <= POINTS; action++) {
    const point = action === POINTS ? PASS : action;
    if (!excluded?.has(point) && legalMove(state, position.next, point)) points.push(point);
  }
  if (!points.length) return node;
  const { policy, value } = await infer(position);
  if (
    policy.length !== POINTS + 1 ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1 + FLOAT32_ULP_AT_ONE
  ) {
    throw new Error('Sortie du réseau Leela Zero invalide');
  }
  const bounded = Math.max(-1, Math.min(1, value));
  node.blackWin = (1 + (position.next === 'B' ? bounded : -bounded)) / 2;
  let max = -Infinity;
  for (const point of points) {
    const logit = policy[netIndex(point)]!;
    if (!Number.isFinite(logit)) throw new Error('Politique Leela Zero invalide');
    max = Math.max(max, logit);
    node.edges.push({ point, prior: logit, visits: 0, blackSum: 0 });
  }
  let sum = 0;
  for (const edge of node.edges) {
    edge.prior = Math.exp(edge.prior - max);
    sum += edge.prior;
  }
  for (const edge of node.edges) edge.prior /= sum;
  return node;
}

function forSide(blackWin: number, next: Color): number {
  return next === 'B' ? blackWin : 1 - blackWin;
}

/**
 * Exploration et estimation initiale d'une branche non visitée selon les paramètres
 * de Leela Zero (GTP::setup_default_parameters, UCTNode::uct_select_child).
 * https://github.com/leela-zero/leela-zero/blob/master/src/UCTNode.cpp
 * https://github.com/leela-zero/leela-zero/blob/master/src/GTP.cpp
 */
function select(node: Node): Edge {
  const side = node.position.next;
  const exploration = 0.5 * Math.sqrt(node.visits * Math.log(0.015 * node.visits + 1.7));
  const firstPlay = forSide(node.blackWin, side) - 0.25 * Math.sqrt(node.visitedPrior);
  let selected = node.edges[0]!;
  let best = -Infinity;
  for (const edge of node.edges) {
    const mean = edge.visits ? forSide(edge.blackSum / edge.visits, side) : firstPlay;
    const score = mean + (exploration * edge.prior) / (1 + edge.visits);
    if (score > best || (score === best && edge.prior > selected.prior)) {
      selected = edge;
      best = score;
    }
  }
  return selected;
}

function visited(node: Node): Edge[] {
  const side = node.position.next;
  return node.edges
    .filter((edge) => edge.visits > 0)
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        forSide(b.blackSum / b.visits, side) - forSide(a.blackSum / a.visits, side) ||
        b.prior - a.prior,
    );
}

function lineOf(first: Edge): number[] {
  const line: number[] = [];
  let edge: Edge | undefined = first;
  while (edge) {
    line.push(edge.point);
    edge = edge.child && visited(edge.child)[0];
  }
  return line;
}

export async function searchZero(
  position: EnginePosition,
  infer: Infer,
  { visits, signal, exclude }: { visits: number; signal?: AbortSignal; exclude?: number[] },
): Promise<ZeroResult> {
  if (!Number.isSafeInteger(visits) || visits < 1)
    throw new RangeError('Budget de visites invalide');
  signal?.throwIfAborted();
  if (finished(position)) return { visits: 0, choices: [] };
  // Une recherche conditionnelle écarte uniquement les premiers coups déjà présentés.
  const root = await expand(
    position,
    rootState(position),
    infer,
    exclude?.length ? new Set(exclude) : undefined,
  );
  if (!root.edges.length) return { visits: 0, choices: [] };
  for (let visit = 0; visit < visits; visit++) {
    signal?.throwIfAborted();
    let node = root;
    const path: { node: Node; edge: Edge }[] = [];
    while (node.edges.length > 0) {
      const edge = select(node);
      path.push({ node, edge });
      if (!edge.child) {
        const childBoard = node.board.clone();
        childBoard.play(node.position.next, edge.point);
        const seen = new Set(node.seen).add(childBoard.positionKey());
        edge.child = await expand(
          afterCandidate(node.position, edge.point),
          { board: childBoard, seen },
          infer,
        );
        signal?.throwIfAborted();
        node = edge.child;
        break;
      }
      node = edge.child;
    }
    for (const step of path) {
      if (step.edge.visits === 0) step.node.visitedPrior += step.edge.prior;
      step.node.visits++;
      step.edge.visits++;
      step.edge.blackSum += node.blackWin;
    }
  }
  return {
    visits: root.visits,
    choices: visited(root).map((edge) => ({
      point: edge.point,
      visits: edge.visits,
      blackWin: edge.blackSum / edge.visits,
      line: lineOf(edge),
    })),
  };
}
