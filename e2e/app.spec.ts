import { expect, test, type Page } from '@playwright/test';

/** Avertissements connus, émis par les bibliothèques et sans effet sur l'application. */
const TOLERATED = [
  /THREE\.Clock: This module has been deprecated/,
  // Émis par le pilote quand le test relit lui-même les pixels du canvas.
  /GPU stall due to ReadPixels/,
];

interface Watch {
  problems: string[];
  foreign: string[];
}

/** Surveille la console, les violations de CSP et toute requête sortant de l'origine. */
function watch(page: Page): Watch {
  const w: Watch = { problems: [], foreign: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (TOLERATED.some((re) => re.test(m.text()))) return;
    w.problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => w.problems.push(`[pageerror] ${e.message}`));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173') {
      w.foreign.push(r.url());
    }
  });
  return w;
}

async function enter(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'L’enfant d’Innoshima' })).toBeVisible();
}

async function openRedEarGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
  await page.getByRole('searchbox').fill('1846-09-11');
  await page.locator('.row').first().click();
  await page.getByRole('button', { name: 'Pause' }).click();
}

test('ouverture : le titre, le décompte du corpus, puis l’entrée dans le récit', async ({
  page,
}) => {
  const w = watch(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hon’inbō Shūsaku' })).toBeVisible();
  await expect(page.locator('.intro__count')).toContainText('391 parties');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'L’enfant d’Innoshima' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  // WebGL a bien dessiné la scène : le moteur marque le canvas après sa première image non vide.
  // (Une capture d'écran du canvas est trop lente en rendu logiciel sur les machines de CI.)
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  expect(w.problems).toEqual([]);
  expect(w.foreign).toEqual([]);
});

test('la politique de sécurité du contenu est en place et rien ne la viole', async ({ page }) => {
  const w = watch(page);
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
  });
  await enter(page);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain("'unsafe-eval'");
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Aide & sources' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Une tentative d'injection est bel et bien bloquée par la politique.
  const blocked = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        document.addEventListener('securitypolicyviolation', () => resolve(true), { once: true });
        const s = document.createElement('script');
        s.textContent = 'window.__pwned = true';
        document.head.append(s);
        setTimeout(() => resolve(false), 1000);
      }),
  );
  expect(blocked).toBe(true);
  expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations.filter((v) => !v.startsWith('script-src-elem inline'))).toEqual([]);
  expect(w.foreign).toEqual([]);
});

test('relecture au clavier : chaque coup est annoncé en toutes lettres', async ({ page }) => {
  const w = watch(page);
  await enter(page);
  const live = page.getByTestId('live');
  await expect(live).toContainText('Position initiale, 3 pierres de handicap');
  await page.locator('canvas').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('Coup 1 sur 245 : Blanc');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(live).toContainText('Coup 11 sur 245');
  await page.keyboard.press('ArrowLeft');
  await expect(live).toContainText('Coup 10 sur 245');
  await page.keyboard.press('End');
  await expect(live).toContainText('Coup 245 sur 245');
  await page.keyboard.press('Home');
  await expect(live).toContainText('Position initiale');
  expect(w.problems).toEqual([]);
});

test('la partie de l’oreille rouge : recherche, coup 127, légende', async ({ page }) => {
  const w = watch(page);
  await enter(page);
  await openRedEarGame(page);
  await expect(page.getByRole('region', { name: 'Partie en cours' })).toContainText(
    '11 septembre 1846',
  );
  await expect(page.getByRole('region', { name: 'Partie en cours' })).toContainText(
    'Inoue Gennan Inseki',
  );
  await page.getByRole('slider', { name: 'Coup' }).fill('127');
  await expect(page.getByRole('heading', { name: 'Le coup de l’oreille rouge' })).toBeVisible();
  await expect(page.getByTestId('live')).toContainText('Coup 127 sur 325 : Noir K11');
  // Le récit a suivi : chapitre III.
  await page.getByRole('button', { name: 'Récit', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'La partie de l’oreille rouge' })).toBeVisible();
  expect(w.problems).toEqual([]);
});

test('lecture automatique : les coups avancent, la pause les arrête', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Vitesse 8 coups par seconde' }).click();
  await page.getByRole('button', { name: 'Lecture' }).click();
  const slider = page.getByRole('slider', { name: 'Coup' });
  // Seuil bas : le rendu logiciel du navigateur de test est bien plus lent qu'un GPU.
  await expect
    .poll(async () => Number(await slider.inputValue()), { timeout: 30_000 })
    .toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Pause' }).click();
  const stopped = Number(await slider.inputValue());
  await page.waitForTimeout(800);
  expect(Number(await slider.inputValue())).toBe(stopped);
});

test('vues, numéros et boîte d’aide', async ({ page }) => {
  const w = watch(page);
  await enter(page);
  const top = page.getByRole('button', { name: 'Dessus' });
  await top.click();
  await expect(top).toHaveAttribute('aria-pressed', 'true');
  const numbers = page.getByRole('button', { name: 'Numéros' });
  await numbers.click();
  await expect(numbers).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Aide & sources' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aide & sources' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link')).toHaveCount(3);
  for (const link of await dialog.getByRole('link').all()) {
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(w.problems).toEqual([]);
});

test('animations réduites : la relecture reste complète, sans mouvement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const w = watch(page);
  await enter(page);
  await openRedEarGame(page);
  await page.getByRole('slider', { name: 'Coup' }).fill('325');
  await expect(page.getByTestId('live')).toContainText('Coup 325 sur 325');
  expect(w.problems).toEqual([]);
});

test('écran étroit : les commandes restent accessibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await expect(page.getByRole('button', { name: 'Lecture' })).toBeInViewport();
  await expect(page.getByRole('slider', { name: 'Coup' })).toBeInViewport();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('mode « deviner » : indice, coup montré, bilan', async ({ page }) => {
  const w = watch(page);
  await enter(page);
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await page.getByRole('button', { name: 'Deviner' }).click();
  const panel = page.getByRole('region', { name: 'Jouer comme Shūsaku' });
  // Première partie : Shūsaku (noir) a trois pierres de handicap, Blanc commence et joue seul.
  await expect(panel).toContainText('joue-t-il le coup 2', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Un indice' }).click();
  await panel.getByRole('button', { name: 'Montrer le coup' }).click();
  await expect(panel).toContainText('Shūsaku a joué');
  await expect(panel).toContainText('0 / 1');
  // L'adversaire répond de lui-même, puis c'est de nouveau à Shūsaku.
  await expect(panel).toContainText('joue-t-il le coup 4', { timeout: 15_000 });
  expect(w.problems).toEqual([]);
});

test('mode « explorer » : un clic sur le goban pose un coup hors de la partie', async ({
  page,
}) => {
  // Sans animation, la caméra est en place immédiatement : le centre du canvas vise le goban.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const w = watch(page);
  await enter(page);
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  const panel = page.getByRole('region', { name: 'Explorer une autre suite' });
  await expect(panel).toContainText('Position après le coup 0');
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas introuvable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel).toContainText('1 coup hors de la partie', { timeout: 15_000 });
  await expect(page.getByTestId('live')).toContainText('Exploration, coup 1 : Blanc');
  await panel.getByRole('button', { name: 'Revenir à la partie' }).click();
  await expect(panel).toContainText('Position après le coup 0');
  expect(w.problems).toEqual([]);
});
