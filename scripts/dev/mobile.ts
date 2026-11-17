/**
 * Mise au point de la mise en page sur téléphone : volet ouvert, volet fermé, légende.
 * Usage : node scripts/dev/mobile.ts <dossier> [url]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'test-results/shots';
const url = process.argv[3] ?? 'http://127.0.0.1:5173/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
// Surface utile d'un iPhone dans Safari, barres du navigateur déduites.
const context = await browser.newContext({
  viewport: { width: 390, height: 700 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const problems: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(e.message));
const shot = (name: string) => page.screenshot({ path: join(out, `${name}.png`) });
/** Hauteur de la zone du goban, et débordement horizontal éventuel de la page. */
const measure = () =>
  page.evaluate(() => ({
    goban: Math.round(
      document.querySelector('.stage__canvas')?.getBoundingClientRect().height ?? 0,
    ),
    deborde: document.documentElement.scrollWidth > window.innerWidth,
    // Commandes qui sortent de l'écran (la bande de réglages défile : elle est exclue).
    horsEcran: [
      ...document.querySelectorAll(
        '.ribbon, .transport__scrub, .transport__row > .transport__group, .card',
      ),
    ]
      .filter(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          e.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .map((e) => e.className),
  }));

await page.goto(url);
await page.getByRole('button', { name: 'Entrer' }).tap();
await page.waitForTimeout(3500);
await shot('mobile-1-recit-ouvert');
console.log('volet ouvert', await measure());
await page.getByRole('button', { name: 'Fermer le volet' }).tap();
const pause = page.getByRole('button', { name: 'Pause' });
if (await pause.count()) await pause.tap();
await page.getByRole('slider', { name: 'Coup' }).fill('14');
await page.waitForTimeout(2500);
await shot('mobile-2-partie');
console.log('volet fermé', await measure());
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
