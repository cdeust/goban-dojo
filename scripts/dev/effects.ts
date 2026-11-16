/** Mise au point : capture les effets de mise en scène sur un coup d'atari et sur le coup 127. */
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
await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
await page.getByRole('searchbox').fill('1846-09-11');
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Pause' }).click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
const slider = page.getByRole('slider', { name: 'Coup' });

// Coup 47 : Noir met trois pierres blanches en atari.
await slider.fill('46');
await page.waitForTimeout(1500);
await page.locator('body').click({ position: { x: 5, y: 500 } });
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(790);
await page.screenshot({ path: 'test-results/shots/15-menace-impact.png' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test-results/shots/16-menace-aura.png' });

// Coup 127 : instant du récit.
await slider.fill('126');
await page.waitForTimeout(1500);
await page.locator('body').click({ position: { x: 5, y: 500 } });
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
await page.screenshot({ path: 'test-results/shots/17-moment.png' });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
