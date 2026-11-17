/** Mise au point : captures du geste des joueurs à plusieurs instants, sous deux angles. */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

mkdirSync('test-results/shots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.getByRole('button', { name: 'Trois-quarts' }).click();
await page.waitForFunction(() => '__players' in window, undefined, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator('body').click({ position: { x: 5, y: 500 } });
// Coup 1 (Noir, R16), coup 2 (Blanc, D17) : une capture pendant le transport, une au contact.
for (const [name, waits] of [
  ['noir', [330, 330, 900]],
  ['blanc', [330, 330, 900]],
] as [string, number[]][]) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(waits[0]!);
  await page.screenshot({ path: `test-results/shots/geste-${name}-1-transport.png` });
  await page.waitForTimeout(waits[1]!);
  await page.screenshot({ path: `test-results/shots/geste-${name}-2-pose.png` });
  await page.waitForTimeout(waits[2]!);
}
// Un coin éloigné : mode Explorer, Noir joue en A19 (coin supérieur gauche, le plus loin de lui).
await page.getByRole('button', { name: 'Dessus' }).click();
await page.getByRole('button', { name: 'Explorer' }).click();
await page.waitForTimeout(2600);
const box = (await page.locator('canvas').boundingBox())!;
// Repère : en vue de dessus le goban est centré ; on vise son coin supérieur gauche.
await page.getByRole('button', { name: 'Trois-quarts' }).click();
await page.waitForTimeout(2400);
await page.evaluate(() => {
  const store = (window as unknown as { __store?: { getState(): { clickPoint(p: number): void } } })
    .__store;
  store?.getState().clickPoint(0);
});
await page.waitForTimeout(640);
await page.screenshot({ path: 'test-results/shots/geste-noir-3-coin.png' });
console.log(
  box ? 'ok' : 'pas de canvas',
  problems.length ? problems.join('\n') : 'aucune erreur console',
);
await browser.close();
