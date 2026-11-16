/** ESSAI : captures du personnage articulé, sous deux angles et à deux instants du geste. */
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
await page.goto('http://127.0.0.1:5173/?essai');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.getByRole('slider', { name: 'Coup' }).fill('40');
await page.getByRole('button', { name: 'Trois-quarts' }).click();
await page.waitForTimeout(5000);
await page.screenshot({ path: 'test-results/shots/40-essai-a.png' });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'test-results/shots/41-essai-b.png' });
await page.getByRole('button', { name: 'Joueur' }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'test-results/shots/42-essai-dessus.png' });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
