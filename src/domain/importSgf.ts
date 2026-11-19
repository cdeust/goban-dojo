import { PASS, SIZE, pointFromSgf, pointToSgf } from './board.ts';
import { buildTimeline, type ImportedGameRecord, type GameResult } from './game.ts';
import { mainLine, parseSgf, prop } from './sgf.ts';

function resultOf(raw: string): GameResult {
  if (/^(0|draw|jigo)$/i.test(raw)) return { winner: 'jigo', raw };
  if (/^void$/i.test(raw)) return { winner: 'unfinished', raw };
  const result = /^([BW])\+(.*)$/i.exec(raw);
  if (!result) return { winner: 'unknown', raw };
  const winner = result[1]!.toUpperCase() === 'B' ? 'B' : 'W';
  const detail = result[2] ?? '';
  if (/^r(esign)?$/i.test(detail)) return { winner, resign: true, raw };
  return /^[\d.]+$/.test(detail) && Number.isFinite(Number(detail))
    ? { winner, margin: Number(detail), raw }
    : { winner, raw };
}

export function importSgf(text: string, id: string, name: string): ImportedGameRecord {
  const root = parseSgf(text, { strict: true });
  const gameType = prop(root, 'GM') ?? '1';
  const size = prop(root, 'SZ') ?? '19';
  if (gameType !== '1' || !['19', '19:19'].includes(size))
    throw new Error('Choisissez un kifu de go sur un goban 19 × 19.');

  const setup = new Set<number>();
  const moves = [];
  for (const node of mainLine(root)) {
    if (node.props.has('AW') || node.props.has('AE') || (moves.length && node.props.has('AB')))
      throw new Error('Ce kifu contient une position composée ou modifiée en cours de partie.');
    for (const value of node.props.get('AB') ?? []) {
      const coordinates = value.split(':');
      const [from, to = from] = coordinates.map(pointFromSgf);
      if (
        coordinates.length > 2 ||
        from === undefined ||
        to === undefined ||
        from === PASS ||
        to === PASS ||
        from % SIZE > to % SIZE ||
        Math.floor(from / SIZE) > Math.floor(to / SIZE)
      )
        throw new Error('Les pierres de départ du kifu sont invalides.');
      for (let y = Math.floor(from / SIZE); y <= Math.floor(to / SIZE); y++)
        for (let x = from % SIZE; x <= to % SIZE; x++) setup.add(y * SIZE + x);
    }
    const black = node.props.get('B');
    const white = node.props.get('W');
    if ((black && white) || ((black ?? white)?.length !== 1 && (black || white)))
      throw new Error('Un nœud SGF doit contenir un seul coup.');
    if (black || white)
      moves.push({
        color: black ? ('B' as const) : ('W' as const),
        point: pointFromSgf((black ?? white)![0]!),
      });
  }
  if (!moves.length) throw new Error('Ce kifu ne contient aucun coup.');
  const timeline = buildTimeline([...setup], moves);
  if (timeline.illegal.length)
    throw new Error('Le kifu contient un coup illégal selon les règles de lecture du goban.');

  const komi = Number(prop(root, 'KM') ?? '0');
  if (!Number.isFinite(komi)) throw new Error('Le komi indiqué dans le kifu est invalide.');
  const declaredHandicap = Number(prop(root, 'HA'));
  const date = prop(root, 'DT')?.trim().split(',')[0] ?? '';
  const [year = '', month = '01', day = '01', ...rest] = date.split('-');
  const validParts =
    rest.length === 0 &&
    /^\d{4}$/.test(year) &&
    /^(0[1-9]|1[0-2])$/.test(month) &&
    /^(0[1-9]|[12]\d|3[01])$/.test(day);
  const dateCheck = validParts ? new Date(year + '-' + month + '-' + day + 'T00:00:00Z') : null;
  const safeDate = dateCheck?.getUTCDate() === Number(day) ? date : '';
  const title = prop(root, 'GN')?.trim() || name.replace(/\.sgf$/i, '');
  return {
    id,
    imported: true,
    date: safeDate,
    black: prop(root, 'PB')?.trim() || 'Noir',
    white: prop(root, 'PW')?.trim() || 'Blanc',
    blackRank: prop(root, 'BR'),
    whiteRank: prop(root, 'WR'),
    handicap:
      Number.isInteger(declaredHandicap) && declaredHandicap > 0 ? declaredHandicap : setup.size,
    komi,
    setupBlack: [...setup].map(pointToSgf).join(''),
    moves: moves
      .map(({ color, point }) => color.toLowerCase() + (point === PASS ? '--' : pointToSgf(point)))
      .join(''),
    result: resultOf(prop(root, 'RE')?.trim() ?? ''),
    event: title || prop(root, 'EV'),
    place: prop(root, 'PC'),
    sources: [],
  };
}
