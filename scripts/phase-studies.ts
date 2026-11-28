import { Board, PASS, SIZE, neighbours, opposite, pointToHuman } from '../src/domain/board.ts';
import { decodeMoves, decodePoints, type GameRecord } from '../src/domain/game.ts';
import { schoolPosition, emptyRegion } from '../src/domain/school.ts';
import { canonicalPosition } from '../src/domain/positionIdentity.ts';
import {
  MIDDLE_STUDY_MODULES,
  extractMiddleGameStudies,
  type StrategyLesson,
} from '../src/story/strategyCourse.ts';
import { LESSONS } from '../src/story/lessons.ts';
import { OPENING_CASE_POSITIONS } from '../src/story/openingCases.ts';

export const MIDDLE_STUDIES_PER_MODULE = 8;
export const YOSE_STUDIES = 24;
type Position = { gameId: string; before: number };
const distance = (a: number, b: number) =>
  Math.abs((a % SIZE) - (b % SIZE)) + Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE));

export function phaseStudies(
  games: readonly GameRecord[],
  teaching: readonly Position[],
  exams: readonly Position[],
): StrategyLesson[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const teachingGames = new Set(teaching.map((e) => e.gameId));
  const examGames = new Set(exams.map((e) => e.gameId));
  const pool = games.filter(
    (g) =>
      teachingGames.has(g.id) &&
      !examGames.has(g.id) &&
      !g.rengo &&
      !g.imported &&
      g.sources.length > 0,
  );
  const key = (e: Position) => {
    const g = byId.get(e.gameId)!;
    return canonicalPosition(schoolPosition(g, e.before), decodeMoves(g.moves)[e.before]!.color);
  };
  const used = new Set([...teaching, ...exams, ...LESSONS, ...OPENING_CASE_POSITIONS].map(key));
  const result: StrategyLesson[] = [];
  const middle = extractMiddleGameStudies(pool, 30);
  for (const module of MIDDLE_STUDY_MODULES) {
    const picked = new Set<string>();
    for (const ex of middle.filter((e) => e.module === module.id)) {
      const identity = key(ex);
      if (used.has(identity) || picked.has(ex.gameId)) continue;
      result.push(ex);
      used.add(identity);
      picked.add(ex.gameId);
      if (picked.size === MIDDLE_STUDIES_PER_MODULE) break;
    }
    if (picked.size !== MIDDLE_STUDIES_PER_MODULE)
      throw new Error(`Not enough new middle-game examples for ${module.id}`);
  }
  // Select small contested local areas, or small captures, late in an authentic game.
  // This is a geometric filter, not an asserted yose value or adjudicated end position.
  const lateDecision = (board: Board, color: 'B' | 'W', point: number) => {
    if (point === PASS || board.get(point) !== null) return null;
    const next = board.clone(),
      played = next.play(color, point);
    if (played.illegal || played.captures.length > 2) return null;
    const region = emptyRegion(board, point);
    if (played.captures.length === 0 && (region.points.length > 12 || region.border.size !== 2))
      return null;
    return {
      captures: played.captures.length,
      regionSize: region.points.length,
      border: region.border.size,
    };
  };
  let yose = 0;
  const stride = Math.max(1, Math.ceil(pool.length / YOSE_STUDIES));
  const ordered = Array.from({ length: stride }, (_, offset) =>
    pool.filter((_, i) => i % stride === offset),
  ).flat();
  for (const game of ordered) {
    if (yose === YOSE_STUDIES) break;
    const moves = decodeMoves(game.moves),
      board = new Board();
    for (const p of decodePoints(game.setupBlack)) board.setup(p, 'B');
    const seen = new Set([board.positionKey()]);
    for (let before = 0; before < moves.length; before++) {
      const move = moves[before]!,
        next = board.clone(),
        played = next.play(move.color, move.point);
      if (played.illegal || (move.point !== PASS && seen.has(next.positionKey()))) break;
      if (before >= Math.max(100, Math.floor(moves.length * 0.7)) && before + 5 <= moves.length) {
        const historic = lateDecision(board, move.color, move.point);
        if (historic) {
          const alternatives: StrategyLesson['evidence']['alternativeSources'] = [];
          for (let i = before + 2; i < Math.min(moves.length, before + 25); i++) {
            const later = moves[i]!;
            if (
              later.color !== move.color ||
              later.point === PASS ||
              distance(later.point, move.point) < 5 ||
              alternatives.some((a) => distance(a.point, later.point) < 5)
            )
              continue;
            if (!lateDecision(board, move.color, later.point)) continue;
            const trial = board.clone();
            if (trial.play(move.color, later.point).illegal || seen.has(trial.positionKey()))
              continue;
            alternatives.push({ point: later.point, before: i });
            if (alternatives.length === 2) break;
          }
          const identity = canonicalPosition(board, move.color);
          if (alternatives.length === 2 && !used.has(identity)) {
            const nearby = neighbours(move.point).filter(
              (p) => board.get(p) === opposite(move.color),
            );
            result.push({
              id: `yose-decision:${game.id}:${before}`,
              module: 'yose-decision',
              gameId: game.id,
              before,
              color: move.color,
              anchors: nearby,
              historical: move.point,
              alternatives: alternatives.map((a) => a.point),
              prompt:
                'Quel secteur de yose traiter en premier ? Comparez les trois choix légaux, les gains locaux et les réponses possibles.',
              observation: historic.captures
                ? `Le coup historique ${pointToHuman(move.point)} capture ${historic.captures} pierre(s). Les autres points sont des coups ultérieurs du même camp dans des secteurs différents. Leur ordre peut modifier les réponses et le bilan final.`
                : `Le coup historique ${pointToHuman(move.point)} entre dans une zone de ${historic.regionSize} intersections vides, bordée par les deux couleurs. Cette taille géométrique n’est pas une valeur de yose.`,
              rubric:
                'Comparer les captures et les frontières de chaque alternative, vérifier les réponses adverses avant de parler de sente, puis examiner l’estimation de score à horizon identique.',
              evidence: {
                sources: [...game.sources],
                alternativeSources: alternatives,
                historicalLine: moves.slice(before, before + 5),
              },
            });
            used.add(identity);
            yose++;
            break;
          }
        }
      }
      board.play(move.color, move.point);
      seen.add(board.positionKey());
    }
  }
  if (yose !== YOSE_STUDIES) throw new Error('Not enough verified late-game choices');
  return result;
}
