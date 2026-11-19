import { neighbours, opposite, pointToSgf } from '../domain/board.ts';
import { boardAt, decodeMoves, decodePoints, type GameRecord } from '../domain/game.ts';
import { colorName } from '../story/format.ts';
import {
  historicalReflectionsOf,
  type Reflection,
  type ReflectionLine,
} from '../story/reflections.ts';
import { studyOf } from './study.ts';

const index = new WeakMap<GameRecord, readonly Reflection[]>();
const alternatives = new WeakMap<Reflection, readonly ReflectionLine[]>();

/** Les motifs portent sur l'effet du coup joué, jamais sur le temps de réflexion supposé. */
export function reflectionsOf(game: GameRecord): readonly Reflection[] {
  const previous = index.get(game);
  if (previous) return previous;

  const scenes = new Map(historicalReflectionsOf(game).map((scene) => [scene.after, scene]));
  for (const tactical of studyOf(game)) {
    const { number, move, captures, atari, connects } = tactical;
    const after = number - 1;
    const attack = captures.length > 0 || atari.length > 0;
    if (
      scenes.has(after) ||
      !(captures.length > 1 || atari.length > 1 || (connects.length && attack))
    ) {
      continue;
    }
    const impact = [
      captures.length > 0 &&
        (captures.length === 1 ? 'prend une pierre' : `prend ${captures.length} pierres`),
      atari.length > 0 && 'laisse des pierres adverses à une seule liberté',
      connects.length > 0 && 'relie des groupes',
    ]
      .filter(Boolean)
      .join(', ');
    const question =
      captures.length > 0
        ? 'Peut-on prendre les pierres marquées ?'
        : 'Où jouer pour enlever une liberté aux pierres marquées ?';
    scenes.set(after, {
      after,
      tactical,
      title: `${number} · ${colorName(move.color)} · ${captures.length ? 'Capture' : 'Atari'}`,
      context:
        'Le kifu donne la position et le coup joué. Vous pouvez essayer d’autres suites depuis ce point.',
      question,
      lines: [{ title: 'Suite du kifu', notes: [`${colorName(move.color)} ${impact}.`] }],
    });
  }
  const result = [...scenes.values()].sort((a, b) => a.after - b.after);
  index.set(game, result);
  return result;
}

/** Propose une défense locale légale quand le groupe mis en atari peut s'étendre. */
export function reflectionLines(game: GameRecord, scene: Reflection): readonly ReflectionLine[] {
  if (!scene.tactical?.atari.length) return scene.lines;
  const cached = alternatives.get(scene);
  if (cached) return cached;
  const { move, atari, number } = scene.tactical;
  const moves = decodeMoves(game.moves);
  const setup = decodePoints(game.setupBlack);
  const defender = opposite(move.color);
  const recordedReply = moves[number];
  const board = boardAt(setup, moves, number);
  const visited = new Set<number>();
  const lines = [...scene.lines];
  for (const stone of atari) {
    const group = board.stonesOf(stone);
    if (visited.has(stone)) continue;
    for (const point of group) visited.add(point);
    const liberty = group.flatMap(neighbours).find((point) => board.get(point) === null);
    if (
      liberty === undefined ||
      (recordedReply?.color === defender && recordedReply.point === liberty)
    )
      continue;
    const result = boardAt(setup, moves, number);
    if (result.play(defender, liberty).illegal || result.libertyCount(liberty) <= 1) continue;
    lines.push({
      title: 'La défense prolonge le groupe',
      variation: `${move.color.toLowerCase()}${pointToSgf(move.point)}${defender.toLowerCase()}${pointToSgf(liberty)}`,
      notes: [
        'Le coup du kifu laisse le groupe attaqué à une seule liberté.',
        `En prolongeant le groupe, ${colorName(defender)} lui rend ${result.libertyCount(liberty)} libertés. La suite reste à explorer.`,
      ],
    });
    break;
  }
  alternatives.set(scene, lines);
  return lines;
}
