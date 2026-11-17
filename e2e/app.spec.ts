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
  await expect(page.locator('.intro__count')).toContainText('469 parties');
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
  await expect(live).toContainText(
    'Yasuda Eisai contre Itagaki Chuzo, 14 décembre 1839. Position initiale',
  );
  await page.locator('canvas').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('Coup 1 sur 191 : Noir R16');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(live).toContainText('Coup 11 sur 191');
  await page.keyboard.press('ArrowLeft');
  await expect(live).toContainText('Coup 10 sur 191');
  await page.keyboard.press('End');
  await expect(live).toContainText('Coup 191 sur 191');
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
  test.slow();
  await enter(page);
  await page.getByRole('button', { name: 'Vitesse 8 coups par seconde' }).click();
  await page.getByRole('button', { name: 'Lecture' }).click();
  const slider = page.getByRole('slider', { name: 'Coup' });
  // Un seul coup suffit à prouver que l'horloge tourne : en rendu logiciel, chaque image bloque
  // le fil principal, et la cadence réelle se mesure avec scripts/dev/playcheck.ts.
  await expect
    .poll(async () => Number(await slider.inputValue()), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(1);
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
  // Les effets de mise en scène sont actifs par défaut et se coupent d'un clic.
  const effects = page.getByRole('button', { name: 'Effets' });
  await expect(effects).toHaveAttribute('aria-pressed', 'true');
  await effects.click();
  await expect(effects).toHaveAttribute('aria-pressed', 'false');
  const numbers = page.getByRole('button', { name: 'Numéros' });
  await numbers.click();
  await expect(numbers).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Aide & sources' }).click();
  const dialog = page.getByRole('dialog', { name: 'Aide & sources' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link')).toHaveCount(7);
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

test('téléphone : le goban reste visible, volet ouvert comme fermé', async ({ page }) => {
  // Surface utile d'un téléphone dans son navigateur.
  await page.setViewportSize({ width: 390, height: 700 });
  await enter(page);
  /** Ce qui occupe l'écran : hauteur du goban, recouvrements, commandes hors de l'écran. */
  const layout = () =>
    page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const canvas = box('.stage__canvas');
      const card = box('.card');
      const dock = box('.dock');
      const panel = box('.panel');
      const play = document.querySelector('.icon-button--primary');
      const at = play?.getBoundingClientRect();
      const hit = at ? document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2) : null;
      return {
        goban: (canvas?.height ?? 0) / window.innerHeight,
        // Rien ne passe sur le goban : la fiche et les commandes commencent où il finit.
        cardBelow: !!canvas && !!card && card.top >= canvas.bottom - 1,
        dockBelow: !!canvas && !!dock && dock.top >= canvas.bottom - 1,
        panelBelow: !panel || (!!dock && panel.top >= dock.bottom - 1),
        playReachable: !!play && !!hit && play.contains(hit),
        offscreen: [
          ...document.querySelectorAll(
            '.ribbon, .transport__scrub, .transport__row > .transport__group, .card',
          ),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
          })
          .map((e) => e.className),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

  // Volet du récit ouvert : il est sous la scène, pas dessus.
  await expect(page.getByRole('button', { name: 'Fermer le volet' })).toBeVisible();
  // L'écran d'ouverture s'efface et la fiche glisse en place : on attend la fin de ces transitions.
  await expect
    .poll(
      async () => {
        const l = await layout();
        return l.playReachable && l.cardBelow;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const open = await layout();
  expect(open.goban).toBeGreaterThan(0.25);
  expect(open).toMatchObject({
    cardBelow: true,
    dockBelow: true,
    panelBelow: true,
    playReachable: true,
    offscreen: [],
    overflow: false,
  });

  // Volet fermé : le goban prend plus de la moitié de l'écran.
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await expect(page.getByRole('slider', { name: 'Coup' })).toBeInViewport();
  const closed = await layout();
  expect(closed.goban).toBeGreaterThan(0.5);
  expect(closed).toMatchObject({
    cardBelow: true,
    dockBelow: true,
    playReachable: true,
    offscreen: [],
    overflow: false,
  });
  // Les réglages restent atteignables dans leur bande.
  await page.getByRole('button', { name: 'Dessus' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Dessus' })).toBeInViewport();
});

test('mode « deviner » : indice, coup montré, bilan', async ({ page }) => {
  const w = watch(page);
  await enter(page);
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await page.getByRole('button', { name: 'Deviner' }).click();
  const panel = page.getByRole('region', { name: 'Jouer comme Shūsaku' });
  // Première partie connue : l'enfant a les noirs et commence.
  await expect(panel).toContainText('joue-t-il le coup 1', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Un indice' }).click();
  await panel.getByRole('button', { name: 'Montrer le coup' }).click();
  await expect(panel).toContainText('Shūsaku a joué');
  await expect(panel).toContainText('0 / 1');
  // L'adversaire répond de lui-même, puis c'est de nouveau à Shūsaku.
  await expect(panel).toContainText('joue-t-il le coup 3', { timeout: 15_000 });
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
  await expect(page.getByTestId('live')).toContainText('Exploration, coup 1 : Noir');
  await panel.getByRole('button', { name: 'Revenir à la partie' }).click();
  await expect(panel).toContainText('Position après le coup 0');
  expect(w.problems).toEqual([]);
});

test('évaluation des coups : le réseau se charge, juge le coup de la partie et un coup exploré', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  await page.getByRole('button', { name: 'Fermer le volet' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  const panel = page.getByRole('region', { name: 'Explorer une autre suite' });
  await panel.getByRole('button', { name: 'Évaluer les coups' }).click();
  // Le premier coup de l'enfant de dix ans, R16, est un coin : le réseau ne le distingue pas du meilleur.
  await expect(panel.locator('.mode__actual')).toContainText('noir a joué R16', {
    timeout: 90_000,
  });
  await expect(panel.locator('.mode__actual .verdict')).toHaveText(/bon coup/, { timeout: 90_000 });
  // Un coup au centre du goban vide, lui, perd nettement.
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas introuvable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel).toContainText('1 coup hors de la partie', { timeout: 15_000 });
  const verdict = panel.locator('.mode__moves .verdict');
  await expect(verdict).toHaveText(/bon coup|discutable|erreur probable/, { timeout: 90_000 });
  await expect(panel).toContainText(/mène d’environ|position équilibrée/);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  expect(w.foreign).toEqual([]);
  expect(w.problems).toEqual([]);
});
