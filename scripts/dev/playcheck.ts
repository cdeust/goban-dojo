/** Mise au point : mesure la cadence réelle de lecture avec accélération matérielle. */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Entrer' }).click();
const slider = page.getByRole('slider', { name: 'Coup' });
for (const speed of ['1 coup', '8 coups']) {
  await page.getByRole('button', { name: `Vitesse ${speed} par seconde` }).click();
  await page.getByRole('button', { name: 'Lecture' }).click();
  const from = Number(await slider.inputValue());
  await page.waitForTimeout(5000);
  const to = Number(await slider.inputValue());
  await page.getByRole('button', { name: 'Pause' }).click();
  console.log(`${speed}/s : ${to - from} coups en 5 s`);
}
await page.screenshot({ path: 'test-results/shots/09-lecture.png' });
await browser.close();
