/** Mise au point : gros plans sur les joueurs, les bols et le goban, pour inspecter les textures. */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

mkdirSync('test-results/shots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const views: [string, string][] = [
  ['visage-blanc', '30,48,-22'],
  ['visage-noir', '-34,44,12'],
  ['bols', '70,60,60'],
  ['goban-ras', '-30,22,58'],
  ['dos-noir', '20,70,150'],
];
for (const [name, eye] of views) {
  await page.goto(`http://127.0.0.1:5173/?oeil=${eye}`);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await page.getByRole('slider', { name: 'Coup' }).fill('60');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `test-results/shots/gros-plan-${name}.png` });
}
await browser.close();
console.log('ok');
