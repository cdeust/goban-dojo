/**
 * Outil de mise au point : pilote l'application dans Chromium et enregistre des captures.
 * Usage : node scripts/dev/shot.ts <dossier> [url]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const out = process.argv[2] ?? 'test-results/shots';
const url = process.argv[3] ?? 'http://127.0.0.1:5173/';
mkdirSync(out, { recursive: true });

const launch = async () => {
  const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ channel: 'chrome', args });
  }
};

const browser = await launch();
const page: Page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const problems: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const shot = async (name: string): Promise<void> => {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`capture ${name}`);
};
const key = async (k: string, times = 1): Promise<void> => {
  for (let i = 0; i < times; i++) await page.keyboard.press(k);
};

await page.goto(url);
await page.getByRole('button', { name: 'Entrer' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
await shot('01-ouverture');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.waitForTimeout(3500);
await shot('02-recit');
// La partie de l'oreille rouge, au coup 127.
await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
await page.getByRole('searchbox').fill('1846-09-11');
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Pause' }).click();
await page.getByRole('slider', { name: 'Coup' }).fill('126');
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.locator('body').click({ position: { x: 5, y: 500 } });
await key('ArrowRight');
await page.waitForTimeout(350);
await shot('03-pose-en-vol');
await page.waitForTimeout(1800);
await shot('04-oreille-rouge-joueur');
await key('3');
await page.waitForTimeout(2600);
await shot('05-dessus');
await key('n');
await page.waitForTimeout(600);
await shot('06-numeros');
await key('n');
await key('2');
await page.getByRole('slider', { name: 'Coup' }).fill('325');
await page.waitForTimeout(2800);
await shot('07-fin-trois-quarts');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await shot('08-mobile');

console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
