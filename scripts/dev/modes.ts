/** Mise au point : essaie les modes « deviner » et « explorer » avec de vrais clics sur le goban. */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = 'test-results/shots';
mkdirSync(out, { recursive: true });
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
await page.getByRole('button', { name: 'Fermer le volet' }).click();
await page.getByRole('button', { name: 'Dessus' }).click();
await page.getByRole('button', { name: 'Deviner' }).click();
await page.waitForTimeout(2600);

// En vue de dessus, le goban est centré dans le canvas ; on en déduit l'échelle par ses bords.
const box = (await page.locator('canvas').boundingBox())!;
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const state = async (): Promise<string> =>
  (await page.locator('.mode').innerText()).replaceAll('\n', ' | ').slice(0, 260);

// Cherche l'échelle : on clique loin du coup attendu (q16), puis on lit la distance annoncée.
const at = async (dx: number, dy: number): Promise<void> => {
  await page.mouse.move(cx + dx, cy + dy);
  await page.waitForTimeout(150);
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(500);
};
await at(0, 0);
console.log('clic au centre →', await state());
await page.screenshot({ path: `${out}/10-deviner-indice.png` });
await at(-120, 120);
console.log('2e clic →', await state());
await page.screenshot({ path: `${out}/11-deviner-zone.png` });
await page.getByRole('button', { name: 'Montrer le coup' }).click();
await page.waitForTimeout(2500);
console.log('après « montrer » →', await state());

await page.getByRole('button', { name: 'Explorer' }).click();
await page.waitForTimeout(400);
for (const [dx, dy] of [
  [0, 0],
  [60, 0],
  [0, 60],
  [60, 60],
  [0, 0],
]) {
  await at(dx!, dy!);
}
console.log('exploration →', await state());
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/12-explorer.png` });
await page.getByRole('button', { name: 'Reprendre un coup' }).click();
await page.waitForTimeout(700);
console.log('après reprise →', await state());
await page.getByRole('button', { name: 'Revenir à la partie' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/13-retour.png` });
console.log(problems.length ? problems.join('\n') : 'aucune erreur console');
await browser.close();
