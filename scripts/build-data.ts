/**
 * Construit public/data/games.json à partir des SGF bruts de data/raw.
 *
 *  1. vérifie l'empreinte de chaque fichier contre data/sources.tsv ;
 *  2. analyse le SGF et en extrait la ligne principale ;
 *  3. rejoue la partie avec le moteur de règles (tout coup illégal est consigné) ;
 *  4. fusionne les doublons, y compris ceux enregistrés sous une autre orientation ;
 *  5. écrit le jeu de données et un rapport de qualité (data/report.json).
 *
 * Déterministe : deux exécutions produisent des fichiers identiques à l'octet près.
 * Usage : pnpm data:build
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASS, SIZE, pointFromSgf, pointToSgf, type Color } from '../src/domain/board.ts';
import {
  buildTimeline,
  decodePoints,
  type Dataset,
  type GameRecord,
  type GameResult,
  type Move,
} from '../src/domain/game.ts';
import { mainLine, parseSgf, prop } from '../src/domain/sgf.ts';
import { SOURCE } from './source.ts';

const root = join(import.meta.dirname, '..');
const rawDir = join(root, 'data', 'raw');

const blobSha = (bytes: Uint8Array): string =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

// ---------------------------------------------------------------- normalisation

/** Variantes orthographiques d'un même joueur dans la source. */
const NAME_ALIASES: Record<string, string> = {
  'Sekiyama Sendaiu': 'Sekiyama Sendayu',
  'Ebizawa Kenzo': 'Ebisawa Kenzo',
  'Gennan Inseki': 'Inoue Gennan Inseki',
  'Inoue Genan Inseki': 'Inoue Gennan Inseki',
  // La source précise : « Honinbo Shuho was still Murase Shuho at the time. »
  'Honinbo Shuho': 'Murase Shuho',
  'Mizutani Nuji': 'Mizutani Nuiji',
};

const cleanName = (s: string | undefined): string => {
  const t = (s ?? '').trim();
  return NAME_ALIASES[t] ?? t;
};

const cleanRank = (s: string | undefined): string | undefined => {
  const m = /^(\d)\s*(p|d|dan)$/i.exec((s ?? '').trim());
  return m ? `${m[1]}e dan` : undefined;
};

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function parseDate(raw: string): { date: string; dateRaw?: string } {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(t);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return (iso[4] ?? '').trim() === '' ? { date } : { date, dateRaw: t };
  }
  const en = /^(\d{1,2}) ([A-Za-z]{3})\.? (\d{4})$/.exec(t);
  if (en) {
    const month = MONTHS[(en[2] as string).toLowerCase()];
    if (month) return { date: `${en[3]}-${month}-${(en[1] as string).padStart(2, '0')}` };
  }
  throw new Error(`date illisible : « ${raw} »`);
}

function translateResultNote(note: string): string {
  const t = note.replace(/[{}()]/g, '').trim();
  let m: RegExpExecArray | null;
  if (/^no further moves known$/i.test(t)) return 'suite des coups inconnue';
  if ((m = /^moves beyond (\d+) not known$/i.exec(t))) return `coups inconnus après le ${m[1]}e`;
  if ((m = /^([BW]) connec[a-z]{1,4} the ko$/i.exec(t)))
    return `${m[1] === 'B' ? 'Noir' : 'Blanc'} connecte le ko`;
  return t;
}

function parseResult(rawIn: string | undefined): GameResult {
  const raw = (rawIn ?? '').trim();
  const noteMatch = /[{(](.*)[)}]/.exec(raw);
  const note = noteMatch ? translateResultNote(noteMatch[0]) : undefined;
  const head = raw.replace(/[{(].*$/, '').trim();
  const base = (r: Omit<GameResult, 'raw'>): GameResult =>
    note ? { ...r, note, raw } : { ...r, raw };
  const side = head.charAt(0).toUpperCase();
  if ((side === 'B' || side === 'W') && head.charAt(1) === '+') {
    const winner = side;
    const tail = head.slice(2).trim();
    if (tail === '') return base({ winner });
    if (/^r/i.test(tail)) return base({ winner, resign: true });
    const margin = Number(tail);
    return Number.isFinite(margin) ? base({ winner, margin }) : base({ winner });
  }
  if (/^black wins by resign/i.test(head)) return base({ winner: 'B', resign: true });
  if (/^white wins by resign/i.test(head)) return base({ winner: 'W', resign: true });
  if (/^(jigo|0|draw)$/i.test(head)) return base({ winner: 'jigo' });
  if (/unfinished/i.test(head)) return base({ winner: 'unfinished' });
  return base({ winner: 'unknown' });
}

const EVENTS: [RegExp, string][] = [
  [/castle game.*o-konomi/i, 'Oshirogo — okonomi-go (partie du château)'],
  [/castle game/i, 'Oshirogo (partie du château)'],
  [/sanju-bango|30-game match|thirty game match/i, 'Sanjūbango (match en trente parties)'],
  [/niju-bango|20-game match|twenty game match/i, 'Nijūbango (match en vingt parties)'],
  [/ju-bango|10-game match|ten game match/i, 'Jūbango (match en dix parties)'],
];

function translateEvent(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim();
  if (t === '' || t === 'None') return undefined;
  for (const [re, label] of EVENTS) if (re.test(t)) return label;
  return t;
}

const UNINFORMATIVE = new Set(['japan', 'ja', 'none', '']);
const cleanText = (s: string | undefined): string | undefined => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return UNINFORMATIVE.has(t.toLowerCase()) ? undefined : t.replace(/, Japan$/, '');
};

// ---------------------------------------------------------------- symétries

const SYMMETRIES: ((x: number, y: number) => [number, number])[] = [
  (x, y) => [x, y],
  (x, y) => [SIZE - 1 - x, y],
  (x, y) => [x, SIZE - 1 - y],
  (x, y) => [SIZE - 1 - x, SIZE - 1 - y],
  (x, y) => [y, x],
  (x, y) => [SIZE - 1 - y, x],
  (x, y) => [y, SIZE - 1 - x],
  (x, y) => [SIZE - 1 - y, SIZE - 1 - x],
];

const SIGNATURE_MOVES = 30;

/**
 * Signature de la mise en place et des premiers coups, invariante par rotation
 * et réflexion du goban.
 */
function signature(setup: number[], moves: Move[]): string {
  const head = moves.slice(0, SIGNATURE_MOVES);
  let best = '';
  for (const f of SYMMETRIES) {
    const map = (p: number): number => {
      const [x, y] = f(p % SIZE, Math.floor(p / SIZE));
      return y * SIZE + x;
    };
    let s = `${setup
      .map(map)
      .sort((a, b) => a - b)
      .map(pointToSgf)
      .join('')}|`;
    for (const m of head) s += m.color + (m.point === PASS ? '--' : pointToSgf(map(m.point)));
    if (best === '' || s < best) best = s;
  }
  return best;
}

/**
 * Part des coups identiques (même rang, même couleur, même point) entre deux parties
 * de même longueur, sous la meilleure des huit symétries. Sert à reconnaître deux
 * transcriptions d'une même partie qui divergent par une erreur de copie.
 */
function similarity(a: Move[], b: Move[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let best = 0;
  for (const f of SYMMETRIES) {
    let same = 0;
    for (let i = 0; i < a.length; i++) {
      const ma = a[i] as Move;
      const mb = b[i] as Move;
      if (ma.color !== mb.color) continue;
      if (ma.point === PASS || mb.point === PASS) {
        if (ma.point === mb.point) same++;
        continue;
      }
      const [x, y] = f(ma.point % SIZE, Math.floor(ma.point / SIZE));
      if (y * SIZE + x === mb.point) same++;
    }
    best = Math.max(best, same / a.length);
  }
  return best;
}

/** Seuil au-delà duquel deux transcriptions de même longueur sont tenues pour la même partie. */
const SAME_GAME_SIMILARITY = 0.9;

// ---------------------------------------------------------------- lecture

interface Parsed {
  sha: string;
  path: string;
  record: GameRecord;
  moves: Move[];
  illegal: number;
  midGameSetup: number;
  hadVariations: boolean;
  shusakuRank?: string;
}

const anomalies: string[] = [];

/** Fichiers où Shūsaku n'est cité que dans l'intitulé de la rencontre, sans y jouer. */
const excluded: string[] = [];

function readOne(sha: string, path: string): Parsed | null {
  const bytes = readFileSync(join(rawDir, `${sha}.sgf`));
  if (blobSha(bytes) !== sha) throw new Error(`empreinte inattendue pour ${path}`);
  let text: string;
  let legacyEncoding = false;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Un fichier est encodé en GB2312 : seuls ses commentaires en dépendent, on ne les exploite pas.
    text = new TextDecoder('latin1').decode(bytes);
    legacyEncoding = true;
  }
  const tree = parseSgf(text);
  if (!/shusaku/i.test(`${prop(tree, 'PB')} ${prop(tree, 'PW')}`)) {
    excluded.push(path);
    return null;
  }
  const line = mainLine(tree);
  const rootNode = line[0];
  if (!rootNode) throw new Error(`SGF vide : ${path}`);
  const size = prop(rootNode, 'SZ');
  if (size !== undefined && size !== '19') throw new Error(`taille ${size} non gérée : ${path}`);

  // Triées : l'ordre d'énumération des pierres de handicap varie d'un fichier à l'autre.
  const setupBlack = (rootNode.props.get('AB') ?? []).map(pointFromSgf).sort((a, b) => a - b);
  if (rootNode.props.has('AW'))
    anomalies.push(`${path} : pierres blanches de mise en place ignorées`);

  const moves: Move[] = [];
  let midGameSetup = 0;
  let hadVariations = false;
  line.forEach((node, idx) => {
    if (node.children.length > 1) hadVariations = true;
    if (idx > 0 && (node.props.has('AB') || node.props.has('AW') || node.props.has('AE'))) {
      midGameSetup++;
    }
    for (const c of ['B', 'W'] as Color[]) {
      const v = node.props.get(c);
      if (v) moves.push({ color: c, point: pointFromSgf(v[0] ?? '') });
    }
  });
  // Les passes finales n'apportent rien à la relecture.
  while (moves.length > 0 && (moves[moves.length - 1] as Move).point === PASS) moves.pop();

  const timeline = buildTimeline(setupBlack, moves);
  for (const i of timeline.illegal)
    anomalies.push(`${path} : coup ${i.move} illégal (${i.reason})`);

  const black = cleanName(prop(rootNode, 'PB'));
  const white = cleanName(prop(rootNode, 'PW'));
  const shusaku: Color = /shusaku/i.test(black) ? 'B' : 'W';
  const { date, dateRaw } = parseDate(prop(rootNode, 'DT') ?? '');
  const blackRank = cleanRank(prop(rootNode, 'BR'));
  const whiteRank = cleanRank(prop(rootNode, 'WR'));
  const note = legacyEncoding ? undefined : cleanText(prop(rootNode, 'C') ?? prop(rootNode, 'GC'));
  const event = translateEvent(prop(rootNode, 'EV'));
  const place = cleanText(prop(rootNode, 'PC'));

  const record: GameRecord = {
    id: sha.slice(0, 10),
    date,
    ...(dateRaw ? { dateRaw } : {}),
    black,
    white,
    ...(blackRank ? { blackRank } : {}),
    ...(whiteRank ? { whiteRank } : {}),
    shusaku,
    shusakuName: shusaku === 'B' ? black : white,
    opponent: shusaku === 'B' ? white : black,
    handicap: setupBlack.length,
    setupBlack: setupBlack.map(pointToSgf).join(''),
    moves: moves
      .map((m) => (m.color === 'B' ? 'b' : 'w') + (m.point === PASS ? '--' : pointToSgf(m.point)))
      .join(''),
    result: parseResult(prop(rootNode, 'RE')),
    ...(event ? { event } : {}),
    ...(place ? { place } : {}),
    ...(note && note !== place ? { note } : {}),
    sources: [path],
  };
  const shusakuRank = shusaku === 'B' ? blackRank : whiteRank;
  return {
    sha,
    path,
    record,
    moves,
    illegal: timeline.illegal.length,
    midGameSetup,
    hadVariations,
    ...(shusakuRank ? { shusakuRank } : {}),
  };
}

// ---------------------------------------------------------------- fusion

/** Préférence entre deux enregistrements d'une même partie. */
function quality(p: Parsed): number {
  let q = 0;
  if (p.illegal === 0) q += 1000;
  q += p.moves.length; // l'enregistrement le plus complet
  if (!p.record.dateRaw) q += 20; // date unique, normalisée
  if (p.record.place) q += 10;
  if (p.record.event) q += 10;
  if (p.record.result.winner !== 'unknown') q += 5;
  return q;
}

function merge(group: Parsed[]): GameRecord {
  const sorted = [...group].sort((a, b) => quality(b) - quality(a) || a.path.localeCompare(b.path));
  const best = (sorted[0] as Parsed).record;
  const out: GameRecord = { ...best, sources: sorted.map((p) => p.path).sort() };
  for (const other of sorted.slice(1)) {
    const o = other.record;
    if (!out.place && o.place) out.place = o.place;
    if (!out.event && o.event) out.event = o.event;
    if (!out.note && o.note) out.note = o.note;
    if (!out.blackRank && o.blackRank) out.blackRank = o.blackRank;
    if (!out.whiteRank && o.whiteRank) out.whiteRank = o.whiteRank;
    if (out.result.winner === 'unknown' && o.result.winner !== 'unknown') out.result = o.result;
    if (o.date !== out.date && !out.dateRaw)
      out.dateRaw = `${out.date} (autre enregistrement : ${o.dateRaw ?? o.date})`;
  }
  return out;
}

// ---------------------------------------------------------------- exécution

const rows = readFileSync(join(root, 'data', 'sources.tsv'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t') as [string, string]);

// Deux chemins peuvent désigner le même contenu (même empreinte) : on ne le lit qu'une fois.
const bySha = new Map<string, string[]>();
for (const [sha, path] of rows) bySha.set(sha, [...(bySha.get(sha) ?? []), path]);

const parsed: Parsed[] = [];
for (const [sha, paths] of [...bySha].sort(([a], [b]) => a.localeCompare(b))) {
  const p = readOne(sha, paths.sort()[0] as string);
  if (!p) continue;
  p.record.sources = paths;
  parsed.push(p);
}

const groups = new Map<string, Parsed[]>();
for (const p of parsed) {
  const key = signature(decodePoints(p.record.setupBlack), p.moves);
  groups.set(key, [...(groups.get(key) ?? []), p]);
}

// Seconde passe : transcriptions divergentes d'une même partie (même adversaire, même
// longueur, coups identiques à plus de 90 %).
const nearDuplicates: string[] = [];
{
  const keys = [...groups.keys()];
  for (let i = 0; i < keys.length; i++) {
    const gi = groups.get(keys[i] as string);
    if (!gi) continue;
    for (let j = i + 1; j < keys.length; j++) {
      const gj = groups.get(keys[j] as string);
      if (!gj) continue;
      const a = gi[0] as Parsed;
      const b = gj[0] as Parsed;
      if (a.record.opponent !== b.record.opponent || a.record.handicap !== b.record.handicap)
        continue;
      const sim = similarity(a.moves, b.moves);
      if (sim >= SAME_GAME_SIMILARITY) {
        nearDuplicates.push(
          `${a.record.date} / ${b.record.date} ${a.record.black} – ${a.record.white} (${Math.round(sim * 1000) / 10} % de coups identiques)`,
        );
        gi.push(...gj);
        groups.delete(keys[j] as string);
      }
    }
  }
}

/** Shūsaku est né en 1829 et reçoit son premier dan le 3 janvier 1840. */
const FIRST_PLAUSIBLE_YEAR = 1840;

const games = [...groups.values()].map(merge);
for (const g of games) {
  if (Number(g.date.slice(0, 4)) < FIRST_PLAUSIBLE_YEAR) g.dateSuspect = true;
}
games.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

const dataset: Dataset = {
  generatedFrom: { ...SOURCE, files: rows.length },
  games,
};

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(join(root, 'public', 'data', 'games.json'), JSON.stringify(dataset));

const count = <T>(items: T[], key: (t: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

const shusakuWins = games.filter((g) => g.result.winner === g.shusaku).length;
const decided = games.filter((g) => g.result.winner === 'B' || g.result.winner === 'W').length;
const report = {
  source: dataset.generatedFrom,
  files: rows.length,
  distinctFiles: bySha.size,
  excludedShusakuNotPlaying: excluded.sort(),
  games: games.length,
  duplicatesMerged: parsed.length - games.length,
  nearDuplicatesMerged: nearDuplicates.sort(),
  totalMoves: games.reduce((s, g) => s + g.moves.length / 3, 0),
  filesWithVariations: parsed.filter((p) => p.hadVariations).length,
  filesWithMidGameSetup: parsed.filter((p) => p.midGameSetup > 0).length,
  illegalMoves: parsed.reduce((s, p) => s + p.illegal, 0),
  dateSuspect: games.filter((g) => g.dateSuspect).map((g) => `${g.date} ${g.black} – ${g.white}`),
  shusakuRecord: {
    wins: shusakuWins,
    decided,
    jigo: games.filter((g) => g.result.winner === 'jigo').length,
  },
  byYear: count(games, (g) => g.date.slice(0, 4)),
  byHandicap: count(games, (g) => String(g.handicap)),
  byWinner: count(games, (g) => g.result.winner),
  opponents: count(games, (g) => g.opponent),
  shusakuRankByYear: count(parsed, (p) => `${p.record.date.slice(0, 4)} ${p.shusakuRank ?? '?'}`),
  anomalies: anomalies.sort(),
};
writeFileSync(join(root, 'data', 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `${report.files} fichiers → ${report.games} parties (${report.duplicatesMerged} doublons fusionnés), ` +
    `${report.totalMoves} coups, ${report.illegalMoves} coups illégaux, ${anomalies.length} anomalies`,
);
