/**
 * Construit public/data/games.json à partir des SGF bruts.
 *
 *  1. vérifie l'empreinte de chaque fichier contre les manifestes (data/cwi.sha256, data/pgd/sources.tsv) ;
 *  2. lit la collection principale (CWI) : une partie par fichier, déjà dédoublonnée par son auteur ;
 *  3. rejoue chaque partie avec le moteur de règles (tout coup illégal est consigné) ;
 *  4. retrouve la même partie dans la collection complémentaire (PGD), à une symétrie du goban
 *     près, pour en reprendre le lieu et les circonstances ;
 *  5. écrit le jeu de données et un rapport de qualité (data/report.json).
 *
 * Déterministe : deux exécutions produisent des fichiers identiques à l'octet près.
 * Usage : pnpm data:build
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASS, SIZE, pointFromSgf, pointToSgf, type Color } from '../src/domain/board.ts';
import {
  buildTimeline,
  type Dataset,
  type GameRecord,
  type GameResult,
  type Move,
} from '../src/domain/game.ts';
import { mainLine, parseSgf, prop, type SgfNode } from '../src/domain/sgf.ts';
import { CWI, PGD } from './source.ts';

const root = join(import.meta.dirname, '..');
const anomalies: string[] = [];

// ---------------------------------------------------------------- lecture commune

interface Body {
  rootNode: SgfNode;
  setupBlack: number[];
  moves: Move[];
  hadVariations: boolean;
}

function readBody(text: string, label: string): Body {
  const line = mainLine(parseSgf(text));
  const rootNode = line[0];
  if (!rootNode) throw new Error(`SGF vide : ${label}`);
  const size = prop(rootNode, 'SZ');
  if (size !== undefined && size !== '19') throw new Error(`taille ${size} non gérée : ${label}`);
  // Triées : l'ordre d'énumération des pierres de handicap varie d'un fichier à l'autre.
  const setupBlack = (rootNode.props.get('AB') ?? []).map(pointFromSgf).sort((a, b) => a - b);
  if (rootNode.props.has('AW'))
    anomalies.push(`${label} : pierres blanches de mise en place ignorées`);
  const moves: Move[] = [];
  let hadVariations = false;
  line.forEach((node, idx) => {
    if (node.children.length > 1) hadVariations = true;
    if (idx > 0 && (node.props.has('AB') || node.props.has('AW') || node.props.has('AE'))) {
      anomalies.push(`${label} : mise en place en cours de partie ignorée`);
    }
    for (const c of ['B', 'W'] as Color[]) {
      const v = node.props.get(c);
      if (v) moves.push({ color: c, point: pointFromSgf(v[0] ?? '') });
    }
  });
  // Les passes finales n'apportent rien à la relecture.
  while (moves.length > 0 && (moves[moves.length - 1] as Move).point === PASS) moves.pop();
  return { rootNode, setupBlack, moves, hadVariations };
}

const UNINFORMATIVE = new Set(['japan', 'ja', 'none', '']);
const cleanText = (s: string | undefined): string | undefined => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return UNINFORMATIVE.has(t.toLowerCase()) ? undefined : t.replace(/, Japan$/, '');
};

const cleanRank = (s: string | undefined): string | undefined => {
  const t = (s ?? '').trim();
  // Titre, et non grade en dan : Hon'inbō Jōwa est inscrit « Meijin ».
  if (/^meijin$/i.test(t)) return 'Meijin';
  const m = /^(\d)\s*(p|d|dan)$/i.exec(t);
  return m ? `${m[1]}${m[1] === '1' ? 'er' : 'e'} dan` : undefined;
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

/** Nombre de coups comparés pour reconnaître une même partie dans deux collections. */
const COMPARED_MOVES = 80;
/** Part minimale de coups identiques, sous la meilleure symétrie, pour conclure à la même partie. */
const SAME_GAME = 0.9;

/**
 * Part des `COMPARED_MOVES` premiers coups identiques (même rang, même couleur, même point)
 * entre deux parties, sous la meilleure des huit symétries du goban.
 */
function similarity(a: Move[], b: Move[]): number {
  const n = Math.min(a.length, b.length, COMPARED_MOVES);
  if (n === 0) return 0;
  let best = 0;
  for (const f of SYMMETRIES) {
    let same = 0;
    for (let i = 0; i < n; i++) {
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
    best = Math.max(best, same / n);
  }
  return best;
}

// ---------------------------------------------------------------- collection principale (CWI)

const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

const NAME_FIXES: Record<string, string> = {
  // La collection écrit « Ebizawa » ; l'usage courant est « Ebisawa ».
  'Ebizawa Kenzo': 'Ebisawa Kenzo',
};
const cleanName = (s: string | undefined): string => {
  const t = (s ?? '').trim();
  return NAME_FIXES[t] ?? t;
};

const isShusaku = (name: string): boolean => /Shusaku|Yasuda Eisai/.test(name);

function parseResult(rawIn: string | undefined): GameResult {
  const raw = (rawIn ?? '').trim();
  const side = raw.charAt(0).toUpperCase();
  if ((side === 'B' || side === 'W') && raw.charAt(1) === '+') {
    const tail = raw.slice(2).trim();
    if (tail === '') return { winner: side, raw };
    if (/^r/i.test(tail)) return { winner: side, resign: true, raw };
    const margin = Number(tail);
    return Number.isFinite(margin) ? { winner: side, margin, raw } : { winner: side, raw };
  }
  if (/^jigo$/i.test(raw)) return { winner: 'jigo', raw };
  if (/^unfinished$/i.test(raw)) return { winner: 'unfinished', raw };
  return { winner: 'unknown', raw };
}

const ordinal = (n: string): string => (n === '1' ? '1ʳᵉ' : `${n}ᵉ`);

function eventOf(ev: string | undefined, round: string | undefined): string | undefined {
  const t = (ev ?? '').trim();
  if (t === '') return undefined;
  const game = round ? ` — ${ordinal(round)} partie` : '';
  if (/^castle game$/i.test(t)) return 'Oshirogo (partie du château)';
  if (/^30-game match$/i.test(t)) return `Sanjūbango (match en trente parties)${game}`;
  if (/^20-game match$/i.test(t)) return `Nijūbango (match en vingt parties)${game}`;
  if (/^10-game match$/i.test(t)) return `Jūbango (match en dix parties)${game}`;
  return t;
}

/**
 * Divergences connues entre le kifu retenu et d'autres relevés de la même partie. Le corpus
 * suit le kifu ; la divergence est signalée au lecteur plutôt que tranchée.
 */
const DISCREPANCIES: Record<string, string> = {
  '269': 'Kifu de 220 coups ; l’index de la collection et une autre transcription en comptent 193.',
  '306':
    'Le kifu donne Noir gagnant de 4 points ; l’index de la collection et une autre transcription donnent 2 points, Noir connectant le ko.',
};

/** Régimes de handicap sans pierres (propriété OH de la collection). */
const REGIMES: Record<string, string> = {
  B: 'josen (toujours Noir)',
  BWB: 'sen-ai-sen (Noir deux parties sur trois)',
};

interface Main {
  number: string;
  record: GameRecord;
  moves: Move[];
}

const cwiDir = join(root, 'data', 'cwi');
const cwiManifest = readFileSync(join(root, 'data', 'cwi.sha256'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split(/\s+/) as [string, string]);
{
  const listed = new Set(cwiManifest.map(([, name]) => name));
  const present = readdirSync(cwiDir).filter((f) => f.endsWith('.sgf'));
  for (const f of present)
    if (!listed.has(f)) throw new Error(`fichier hors manifeste : data/cwi/${f}`);
}

const main: Main[] = [];
const lost: string[] = [];
let cwiVariations = 0;

for (const [hash, name] of cwiManifest) {
  const bytes = readFileSync(join(cwiDir, name));
  if (sha256(bytes) !== hash) throw new Error(`empreinte inattendue pour data/cwi/${name}`);
  const number = name.replace('.sgf', '');
  const label = `cwi:${number}`;
  const body = readBody(new TextDecoder('utf-8', { fatal: true }).decode(bytes), label);
  const r = body.rootNode;
  const black = cleanName(prop(r, 'PB'));
  const white = cleanName(prop(r, 'PW'));
  const dt = (prop(r, 'DT') ?? '').trim();
  // « 1846-09-11,14,15 », « 1842-04 », « 1849 », ou une mention libre comme « Summer 1857 ».
  const first =
    /^\d{4}-\d{2}-\d{2}/.exec(dt)?.[0] ??
    /^\d{4}-\d{2}/.exec(dt)?.[0] ??
    /^\d{4}/.exec(dt)?.[0] ??
    /\b(1[78]\d{2})\b/.exec(dt)?.[1];
  if (!first) throw new Error(`date illisible : ${label} « ${dt} »`);

  if (body.moves.length === 0) {
    lost.push(
      `${first} ${black} – ${white} (${prop(r, 'RE') ?? '?'}) : kifu perdu, métadonnées seules`,
    );
    continue;
  }
  if (body.hadVariations) cwiVariations++;
  const timeline = buildTimeline(body.setupBlack, body.moves);
  for (const i of timeline.illegal)
    anomalies.push(`${label} : coup ${i.move} illégal (${i.reason})`);

  if (isShusaku(black) === isShusaku(white))
    throw new Error(`camp de Shūsaku indéterminé : ${label}`);
  const shusaku: Color = isShusaku(black) ? 'B' : 'W';
  const mine = shusaku === 'B' ? black : white;
  const rengo = mine.includes(',');
  const ha = Number(prop(r, 'HA') ?? 0);
  if (ha !== body.setupBlack.length) {
    anomalies.push(
      `${label} : HA[${ha}] mais ${body.setupBlack.length} pierres de handicap placées`,
    );
  }
  const blackRank = cleanRank(prop(r, 'BR'));
  const whiteRank = cleanRank(prop(r, 'WR'));
  const jd = cleanText(prop(r, 'JD'));
  const event = eventOf(prop(r, 'EV'), prop(r, 'RO'));
  const place = cleanText(prop(r, 'PC'));
  const regime = REGIMES[(prop(r, 'OH') ?? '').trim()];
  const pretty = (n: string): string => n.split(',').join(' · ');

  const record: GameRecord = {
    id: `s${number}`,
    date: first,
    ...(dt !== first ? { sessions: dt.replace(/^Summer /, 'été ') } : {}),
    ...(jd ? { dateJapanese: jd } : {}),
    black: pretty(black),
    white: pretty(white),
    ...(blackRank ? { blackRank } : {}),
    ...(whiteRank ? { whiteRank } : {}),
    shusaku,
    shusakuName: rengo ? 'Shusaku' : mine,
    opponent: pretty(shusaku === 'B' ? white : black),
    ...(rengo ? { rengo: true } : {}),
    handicap: body.setupBlack.length,
    ...(regime ? { regime } : {}),
    setupBlack: body.setupBlack.map(pointToSgf).join(''),
    moves: body.moves
      .map((m) => (m.color === 'B' ? 'b' : 'w') + (m.point === PASS ? '--' : pointToSgf(m.point)))
      .join(''),
    result: parseResult(prop(r, 'RE')),
    ...(event ? { event } : {}),
    ...(place ? { place } : {}),
    ...(DISCREPANCIES[number] ? { note: DISCREPANCIES[number] } : {}),
    sources: [label],
  };
  main.push({ number, record, moves: body.moves });
}

// La collection est annoncée sans doublon : on le vérifie.
const internalDuplicates: string[] = [];
for (let i = 0; i < main.length; i++) {
  for (let j = i + 1; j < main.length; j++) {
    const a = main[i] as Main;
    const b = main[j] as Main;
    if (a.record.setupBlack.length !== b.record.setupBlack.length) continue;
    if (Math.abs(a.moves.length - b.moves.length) > 2) continue;
    if (similarity(a.moves, b.moves) >= SAME_GAME) {
      internalDuplicates.push(`cwi:${a.number} / cwi:${b.number}`);
    }
  }
}

// ---------------------------------------------------------------- collection complémentaire (PGD)

const blobSha = (b: Uint8Array): string =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');

interface Extra {
  path: string;
  moves: Move[];
  handicap: number;
  place?: string;
  okonomi: boolean;
}

const pgdRows = readFileSync(join(root, 'data', 'pgd', 'sources.tsv'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t') as [string, string]);
const pgdBySha = new Map<string, string[]>();
for (const [sha, path] of pgdRows) pgdBySha.set(sha, [...(pgdBySha.get(sha) ?? []), path].sort());

const extras: Extra[] = [];
for (const [sha, paths] of [...pgdBySha].sort(([a], [b]) => a.localeCompare(b))) {
  const bytes = readFileSync(join(root, 'data', 'pgd', 'raw', `${sha}.sgf`));
  if (blobSha(bytes) !== sha) throw new Error(`empreinte inattendue pour pgd:${paths[0]}`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Un fichier est encodé en GB2312 : seuls ses commentaires en dépendent, et on ne les lit pas.
    text = new TextDecoder('latin1').decode(bytes);
  }
  const path = paths[0] as string;
  const body = readBody(text, `pgd:${path}`);
  const r = body.rootNode;
  const place = cleanText(prop(r, 'PC'));
  extras.push({
    path,
    moves: body.moves,
    handicap: body.setupBlack.length,
    ...(place ? { place } : {}),
    okonomi: /o-konomi/i.test(prop(r, 'EV') ?? ''),
  });
}

let enriched = 0;
const pgdMatched = new Set<string>();
for (const g of main) {
  const twins = extras.filter(
    (e) => e.handicap === g.record.handicap && similarity(e.moves, g.moves) >= SAME_GAME,
  );
  if (twins.length === 0) continue;
  for (const t of twins) pgdMatched.add(t.path);
  const place = twins
    .map((t) => t.place)
    .filter(Boolean)
    .sort((a, b) => (b as string).length - (a as string).length)[0];
  const before = JSON.stringify(g.record);
  if (place && (!g.record.place || place.length > g.record.place.length)) g.record.place = place;
  if (twins.some((t) => t.okonomi) && g.record.event?.startsWith('Oshirogo')) {
    g.record.event = 'Oshirogo — okonomi-go (partie du château)';
  }
  if (JSON.stringify(g.record) !== before) {
    enriched++;
    g.record.sources.push(...twins.filter((t) => t.place || t.okonomi).map((t) => `pgd:${t.path}`));
  }
}
const pgdUnmatched = extras
  .filter((e) => !pgdMatched.has(e.path) && e.moves.length > 0)
  .map((e) => e.path);

// ---------------------------------------------------------------- écriture

/** Clé de tri : une date connue au mois ou à l'année près est placée au milieu de sa période. */
const sortKey = (date: string): string =>
  date.length === 10 ? date : date.length === 7 ? `${date}-15` : `${date}-07-01`;

// Ordre chronologique ; à date égale, l'ordre de la collection.
const games = main
  .map((m) => m.record)
  .sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)) || a.id.localeCompare(b.id));

const dataset: Dataset = {
  generatedFrom: {
    cwi: { page: CWI.page, archiveSha256: CWI.archiveSha256, files: cwiManifest.length },
    pgd: { ...PGD, files: pgdRows.length },
  },
  games,
};

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(join(root, 'public', 'data', 'games.json'), JSON.stringify(dataset));

const count = <T>(items: T[], key: (t: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

const solo = games.filter((g) => !g.rengo);
const decided = solo.filter((g) => g.result.winner === 'B' || g.result.winner === 'W');
const report = {
  sources: dataset.generatedFrom,
  games: games.length,
  rengo: games.length - solo.length,
  lostKifu: lost,
  totalMoves: games.reduce((s, g) => s + g.moves.length / 3, 0),
  illegalMoves: anomalies.filter((a) => a.includes('illégal')).length,
  filesWithVariations: cwiVariations,
  internalDuplicates,
  enrichedFromPgd: enriched,
  pgdFilesNotInCwi: pgdUnmatched.sort(),
  shusakuRecord: {
    wins: decided.filter((g) => g.result.winner === g.shusaku).length,
    decided: decided.length,
    jigo: solo.filter((g) => g.result.winner === 'jigo').length,
    unfinished: solo.filter((g) => g.result.winner === 'unfinished').length,
  },
  byYear: count(games, (g) => g.date.slice(0, 4)),
  byHandicap: count(games, (g) => String(g.handicap)),
  byWinner: count(games, (g) => g.result.winner),
  byShusakuName: count(games, (g) => g.shusakuName),
  datePrecision: count(games, (g) =>
    g.date.length === 10 ? 'jour' : g.date.length === 7 ? 'mois' : 'année',
  ),
  opponents: count(games, (g) => g.opponent),
  anomalies: anomalies.sort(),
};
writeFileSync(join(root, 'data', 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `${cwiManifest.length} fichiers CWI → ${report.games} parties (${report.rengo} rengo, ${lost.length} kifu perdu), ` +
    `${report.totalMoves} coups, ${report.illegalMoves} coups illégaux, ${anomalies.length} anomalies ; ` +
    `${enriched} parties enrichies par PGD`,
);
