/** Rejoue indépendamment chaque préfixe du SGF avec les vrais workers du dojo. */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { importSgf } from '../../src/domain/importSgf.ts';
import { decodeMoves, decodePoints } from '../../src/domain/game.ts';
import { MODEL } from '../../src/engine/model.ts';
import { ZERO_MODEL } from '../../src/engine/zeroModel.ts';

const [source, output, visitsArg, limitArg] = process.argv.slice(2);
const visits = Number(visitsArg ?? 32);
const limit = Number(limitArg ?? Number.MAX_SAFE_INTEGER);
if (
  !source ||
  !output ||
  !Number.isInteger(visits) ||
  visits < 1 ||
  visits > 128 ||
  !Number.isInteger(limit) ||
  limit < 1
) {
  throw new Error(
    'Usage : node scripts/dev/benchmark-pro.ts <kifu.sgf> <résultats.ndjson> [visites 1–128] [nombre de coups]',
  );
}
const raw = readFileSync(source);
const game = importSgf(raw.toString('utf8'), 'benchmark-pro', 'Benchmark professionnel');
const moves = decodeMoves(game.moves),
  setupBlack = decodePoints(game.setupBlack);
const count = Math.min(moves.length, limit);
// Ne pas écraser une mesure antérieure. Les résultats sont écrits au fur et à mesure.
writeFileSync(output, '', { flag: 'wx' });
console.log(
  JSON.stringify({
    game: { black: game.black, white: game.white, date: game.date, komi: game.komi },
    moves: count,
    visits,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    player: ZERO_MODEL.sha256,
    judge: MODEL.sha256,
  }),
);
const server = await createServer({ server: { host: '127.0.0.1', port: 4187, strictPort: true } });
try {
  await server.listen();
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4187/scripts/dev/benchmark-pro.html', {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => Boolean(window.dojoBenchmark));
    await page.evaluate(() => window.dojoBenchmark!.ready());
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      const move = moves[i]!;
      const row = await page.evaluate((input) => window.dojoBenchmark!.compare(input), {
        position: { setupBlack, moves: moves.slice(0, i), next: move.color, komi: game.komi },
        move,
        number: i + 1,
        visits,
      });
      appendFileSync(output, JSON.stringify(row) + '\n');
      if ((i + 1) % 10 === 0 || i + 1 === count)
        console.log(`${i + 1}/${count} · ${Math.round((performance.now() - start) / 1000)} s`);
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
