/** Mise au point : évaluation du coup 127 de la partie de l'oreille rouge, et d'un coup exploré. */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

mkdirSync('test-results/shots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
});
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
await page.getByRole('searchbox').fill('1846-09-11');
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.getByRole('button', { name: 'Dessus' }).click();
await page.getByRole('button', { name: 'Explorer' }).click();
await page.getByRole('slider', { name: 'Coup' }).fill('126');
const t0 = Date.now();
await page.getByRole('button', { name: 'Évaluer les coups' }).click();
const panel = page.locator('.mode');
try {
  await panel.locator('.mode__actual .verdict:not(.verdict--pending)').waitFor({ timeout: 30000 });
} catch {
  console.log('ÉCHEC — panneau :', (await panel.innerText()).replaceAll('\n', ' | '));
  console.log(problems.join('\n') || 'aucune erreur console');
  await browser.close();
  process.exit(1);
}
console.log(`moteur prêt et premier jugement en ${Date.now() - t0} ms`);
console.log('coup 127 →', (await panel.locator('.mode__actual').innerText()).replaceAll('\n', ' '));
const box = (await page.locator('canvas').boundingBox())!;
await page.mouse.click(box.x + box.width / 2 - 150, box.y + box.height / 2 + 40);
const t1 = Date.now();
await panel.locator('.mode__moves .verdict:not(.verdict--pending)').waitFor({ timeout: 60000 });
console.log(
  `coup exploré jugé en ${Date.now() - t1} ms →`,
  (await panel.locator('.mode__moves').innerText()).replaceAll('\n', ' '),
);
console.log((await panel.locator('.mode__lead-estimate').innerText()).replaceAll('\n', ' '));
await page.waitForTimeout(900);
await page.screenshot({ path: 'test-results/shots/14-evaluation.png' });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
