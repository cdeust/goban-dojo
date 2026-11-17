/**
 * Contrôle du geste des joueurs, mesuré dans le navigateur sur la scène chargée :
 *  1. fidélité du portage : bras recalculé contre bras de l'animation d'origine (coup K11) ;
 *  2. portée : écart du bout du doigt au point visé, pour les 361 intersections et les deux joueurs.
 * Usage : node scripts/dev/rig.ts   (serveur de développement lancé)
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const problems: string[] = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.waitForFunction(() => '__players' in window, undefined, { timeout: 60000 });
const report = await page.evaluate(() => {
  const players = (
    window as unknown as {
      __players: { baselineError(): number; missAt(c: string, p: number): number };
    }
  ).__players;
  const out: Record<string, unknown> = { baselineDeg: (players.baselineError() * 180) / Math.PI };
  for (const color of ['B', 'W']) {
    const gaps: number[] = [];
    for (let p = 0; p < 361; p++) gaps.push(players.missAt(color, p));
    const sorted = [...gaps].sort((a, b) => a - b);
    const worst = gaps.indexOf(sorted[360]!);
    out[color] = {
      max: sorted[360],
      median: sorted[180],
      over1mm: gaps.filter((g) => g > 0.1).length,
      worstPoint: `${'ABCDEFGHJKLMNOPQRST'[worst % 19]}${19 - Math.floor(worst / 19)}`,
    };
  }
  return out;
});
console.log(JSON.stringify(report, null, 1));
console.log(problems.length ? problems.slice(0, 5).join('\n') : 'aucune erreur');
await browser.close();
