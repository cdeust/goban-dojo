/** Mise au point : la pièce sous les deux styles, depuis l'écran d'ouverture et de trois-quarts. */
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
await page.getByRole('button', { name: 'Entrer' }).waitFor();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'test-results/shots/30-ouverture-manga.png' });
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.getByRole('slider', { name: 'Coup' }).fill('120');
await page.getByRole('button', { name: 'Trois-quarts' }).click();
await page.getByRole('button', { name: 'Réaliste' }).click();
await page.waitForTimeout(3200);
await page.screenshot({ path: 'test-results/shots/31-realiste-trois-quarts.png' });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
