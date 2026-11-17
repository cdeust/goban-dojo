/** Mise au point : bols et couvercles en fin de partie, vus de près. */
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
await page.goto('http://127.0.0.1:5173/?oeil=-150,75,-25');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
await page.getByRole('searchbox').fill('1846-09-11');
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Pause' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.waitForFunction(() => '__players' in window, undefined, { timeout: 60000 });
await page.getByRole('slider', { name: 'Coup' }).fill('325');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'test-results/shots/fin-couvercles.png' });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
