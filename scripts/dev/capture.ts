/** Mise au point : la main ramasse un prisonnier (partie de l'oreille rouge, coup 40). */
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
await page.goto('http://127.0.0.1:5173/?oeil=-150,95,60');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
await page.getByRole('searchbox').fill('1846-09-11');
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Pause' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.waitForFunction(() => '__players' in window, undefined, { timeout: 60000 });
await page.getByRole('slider', { name: 'Coup' }).fill('39');
await page.waitForTimeout(2500);
await page.locator('body').click({ position: { x: 5, y: 500 } });
await page.keyboard.press('ArrowRight');
for (const [i, wait] of [900, 330, 330, 420, 900].entries()) {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `test-results/shots/capture-${i + 1}.png` });
}
const live = await page.getByTestId('live').innerText();
console.log(live, '|', problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
