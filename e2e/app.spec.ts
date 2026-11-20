import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function expectDockedGoban(page: Page, simulation: Locator): Promise<void> {
  const board = await page.locator('canvas[data-rendered="true"]').boundingBox();
  const panel = await simulation.boundingBox();
  const viewport = page.viewportSize();
  if (!board || !panel || !viewport) throw new Error('Goban ou encart hors affichage');
  expect(panel.y).toBeGreaterThanOrEqual(board.y + board.height);
  expect(panel.x).toBeLessThan(board.x + board.width);
  expect(panel.x + panel.width).toBeGreaterThan(board.x);
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
}

async function openRedEarGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Parties', exact: true }).first().click();
  await page.getByRole('searchbox').fill('1846-09-11');
  const game = page.locator('.row').filter({ has: page.locator('time[datetime="1846-09-11"]') });
  await game.click();
  await expect(game).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Premier coup', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Coup', exact: true })).toHaveValue('0');
}

test('ouverture : le titre, le décompte du corpus, puis l’entrée dans le récit', async ({
  page,
}) => {
  const w = watch(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Atelier de go' })).toBeVisible();
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

test('étudier une capture sur mobile : filtrer, comparer et ouvrir une variante', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await page.getByRole('button', { name: 'Étudier cette partie' }).click();
  const study = page.getByRole('region', { name: 'Étude du kifu' });
  await expect(study.getByRole('heading', { name: 'Étude du kifu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(study.getByLabel('Thème')).toBeFocused();
  const slider = page.getByRole('slider', { name: 'Coup' });
  await study.getByLabel('Thème').selectOption('captures');
  await expect(study.getByRole('heading', { name: 'Coup 84' })).toBeVisible();
  await expect(slider).toHaveValue('83');
  await expect(study.getByText('Capture.', { exact: true })).toHaveCount(0);
  const studyBox = await study.boundingBox();
  const canvasBox = await page.locator('canvas').boundingBox();
  expect(studyBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(studyBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height);
  expect(studyBox!.width).toBeLessThanOrEqual(390);
  expect(await study.evaluate((panel) => panel.scrollHeight - panel.clientHeight)).toBe(0);

  await study.getByRole('button', { name: 'Jouer le coup du kifu' }).click();
  await expect(slider).toHaveValue('84');
  await expect(study).toContainText('Retire la pierre en P13');
  await study.getByRole('button', { name: 'Revoir avant le coup' }).click();
  await expect(slider).toHaveValue('83');
  await study.getByRole('button', { name: 'Suivante' }).click();
  await expect(slider).toHaveValue('86');
  await study.getByRole('button', { name: 'Essayer une variante' }).click();
  await expect(page.getByRole('heading', { name: 'Explorer une autre suite' })).toBeFocused();
  await expect(slider).toHaveValue('86');
});

test('réflexion : interruption documentée, variante, puis retour au kifu', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await openRedEarGame(page);
  await page.getByRole('slider', { name: 'Coup' }).fill('89');
  await page.getByRole('button', { name: 'Réflexion', exact: true }).click();
  const reflection = page.getByRole('region', { name: 'Temps de réflexion' });
  await expect(reflection.getByRole('heading', { name: 'Temps de réflexion' })).toBeFocused();
  await expect(reflection).toContainText('Interruption documentée');
  await reflection.getByLabel('Moment de la partie').selectOption('126');
  await expect(reflection).toContainText('Le temps pris pour le jouer est inconnu');
  await reflection.getByRole('button', { name: 'Jouer le premier coup' }).click();
  await expect(reflection).toContainText('Noir K11');
  await expect(page.locator('.impact__arcs')).toHaveCount(0);
  await reflection.getByLabel('Suite à examiner').selectOption('1');
  await reflection.getByRole('button', { name: 'Jouer le premier coup' }).click();
  await expect(reflection).toContainText('Variante pédagogique');
  await expect(reflection).toContainText('Noir G4');
  await reflection.getByRole('button', { name: 'Coup suivant' }).click();
  await expect(reflection).toContainText('Blanc E18');
  await reflection.getByRole('button', { name: 'Reculer' }).click();
  await expect(reflection).toContainText('Noir G4');
  await reflection.getByRole('button', { name: 'Voir les simulations' }).click();
  const simulation = page.getByRole('region', { name: 'Noir · avant le coup 127' });
  await expect(simulation.getByRole('button', { name: 'Lire les variantes' })).toBeVisible();
  await expect(simulation.locator('.simulation__view')).toHaveAttribute('data-step', '0');
  await simulation.getByRole('button', { name: 'Jouer le coup du kifu' }).click();
  await expect(page.getByRole('slider', { name: 'Coup', exact: true })).toHaveValue('127');
});

test('réflexion : le coup historique K11 déclenche les éclairs bleus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enter(page);
  await openRedEarGame(page);
  await page.getByRole('slider', { name: 'Coup', exact: true }).fill('126');
  await page.getByRole('button', { name: 'Réflexion', exact: true }).click();
  const reflection = page.getByRole('region', { name: 'Temps de réflexion' });
  await expect(reflection.getByLabel('Moment de la partie')).toHaveValue('126');
  await page.locator('canvas[data-rendered="true"]').waitFor();
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const path = document.querySelector('.impact--initiative .impact__arcs path');
      if (path?.getAttribute('d')?.match(/M/g)?.length !== 4) return;
      document.body.dataset.sawInitiative = 'true';
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  await reflection.getByRole('button', { name: 'Jouer le premier coup' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-saw-initiative', 'true');
});

test('KataGo : 144 suites, comparaison au kifu et retour depuis une réponse', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await openRedEarGame(page);
  await page.getByRole('slider', { name: 'Coup' }).fill('126');
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  const analysis = page.getByRole('region', { name: 'Lire les variantes' });
  await analysis.getByRole('button', { name: 'Lancer KataGo' }).click();
  const started = performance.now();
  const candidates = analysis.locator('.analysis__choice');
  const kifu = candidates.filter({ hasText: 'Coup du kifu' });
  await expect(kifu).toContainText('K11', { timeout: 60_000 });
  const first = performance.now() - started;
  await expect(analysis.getByRole('status')).toContainText('144 suites en deux coups', {
    timeout: 60_000,
  });
  console.log(
    `KataGo K11 : premières propositions ${Math.round(first)} ms, balayage ${Math.round(performance.now() - started)} ms. Kifu : ${await kifu.textContent()}`,
  );
  await expect(candidates).toHaveCount(12);
  await expect(kifu).toContainText('Réponses');
  await kifu.click();
  await expect(analysis.getByRole('heading', { name: 'Blanc au trait' })).toBeVisible();
  const recordedReply = candidates.filter({ hasText: 'Coup du kifu' });
  await expect(recordedReply).toContainText('E18');
  await recordedReply.click();
  await expect(analysis.getByRole('heading', { name: 'Noir au trait' })).toBeVisible();
  await analysis.getByRole('button', { name: 'Départ' }).click();
  await expect(kifu).toContainText('K11');
  await expect(analysis.locator('.analysis__path')).toHaveCount(0);
});

test('lecture longue : 60 coups après K11, bifurcation et retour à la branche', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await openRedEarGame(page);
  await page.getByRole('slider', { name: 'Coup' }).fill('126');
  await expect(page.getByRole('heading', { name: 'Avant le coup 127' })).toBeVisible();
  await page.getByRole('button', { name: 'Examiner cette position' }).click();
  await page.getByRole('button', { name: 'Lire 60 coups d’avance' }).click();
  const reading = page.getByRole('region', { name: 'Lecture longue' });
  await reading.getByRole('radio', { name: 'KataGo' }).check();
  await reading.getByRole('button', { name: 'Lancer KataGo' }).click();
  const start = reading.getByRole('button', { name: /Lire après K11/ });
  await expect(start).toBeVisible({ timeout: 60_000 });
  const initial = performance.now();
  await start.click();
  const slider = reading.getByRole('slider', { name: 'Coup dans la simulation' });
  await expect(slider).toBeVisible({ timeout: 60_000 });
  const first = Math.round(performance.now() - initial);
  await reading.getByRole('button', { name: 'Avancer' }).click();
  await expect(reading.getByRole('heading', { name: 'Noir K11' })).toBeVisible();
  const ownership = reading.getByRole('button', { name: 'Territoires estimés' });
  await ownership.click();
  await expect(ownership).toHaveAttribute('aria-pressed', 'true');
  await expect(reading.getByRole('status')).toHaveText('60 coups disponibles', {
    timeout: 120_000,
  });
  console.log(
    `Lecture K11 : premier coup ${first} ms, 60 coups ${Math.round(performance.now() - initial)} ms`,
  );
  await slider.fill('60');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Coup 60 sur 60');
  await slider.fill('0');
  const alternate = reading.locator('.analysis__choice[aria-pressed="false"]').first();
  const alternatePoint = await alternate.locator('strong').innerText();
  await alternate.click();
  await expect(reading.locator('.analysis__choice[aria-pressed="true"] strong')).toHaveText(
    alternatePoint,
    { timeout: 60_000 },
  );
  await reading.getByRole('button', { name: 'Comparer avec la branche précédente' }).click();
  await expect(reading.locator('.analysis__choice[aria-pressed="true"] strong')).toHaveText('K11');
  await expect(slider).toHaveAttribute('max', '60');
});

test('la réduction des animations conserve les estimations au pas à pas pour les deux camps', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  const slider = page.locator('input[aria-label="Coup"]');
  for (const [start, anchor, coup, color] of [
    ['78', '79', '80', 'Blanc'],
    ['151', '152', '153', 'Noir'],
  ] as const) {
    await slider.fill(start);
    await page.getByRole('button', { name: 'Lecture', exact: true }).click();
    const simulation = page.getByRole('region', { name: color + ' · avant le coup ' + coup });
    const view = simulation.locator('.simulation__view');
    await expect(simulation.getByRole('button', { name: 'Lire les variantes' })).toBeVisible();
    await expect(view).toHaveAttribute('data-branch', '1', { timeout: 60_000 });
    await expect(view.getByText('Avance estimée')).toBeVisible({ timeout: 60_000 });
    await expect(view).toHaveAttribute('data-step', '0');
    await simulation.getByRole('button', { name: 'Coup simulé suivant' }).click();
    await expect(view).toHaveAttribute('data-step', '1');
    await expect(view.getByText('Variation pour ' + color)).toBeVisible({ timeout: 60_000 });
    await expect(slider).toHaveValue(anchor);
    await simulation.getByRole('button', { name: 'Jouer le coup du kifu' }).click();
    await expect(slider).toHaveValue(coup);
  }
  const tacticalPauses = page.getByRole('button', { name: 'Coups forts' });
  await tacticalPauses.click();
  await expect(tacticalPauses).toHaveAttribute('aria-pressed', 'false');
  await slider.fill('151');
  await page.getByRole('button', { name: 'Lecture', exact: true }).click();
  // Le rendu logiciel peut monopoliser le fil principal au changement de position.
  await expect
    .poll(async () => Number(await slider.inputValue()), { timeout: 90_000 })
    .toBeGreaterThan(152);
});

test('les simulations se succèdent sur le même goban puis la réponse ouvre sa propre scène', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enter(page);
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Partie suivante' }).click();
  const slider = page.locator('input[aria-label="Coup"]');
  await slider.fill('86');
  const goban = page.locator('canvas[data-rendered=true]');
  const position = await goban.boundingBox();
  await page.evaluate(() => {
    const live = document.querySelector('[data-testid="live"]')!;
    const observer = new MutationObserver(() => {
      if (live.textContent.includes('Noir F7')) document.body.dataset.sawBlackMove = 'true';
      if (live.textContent.includes('Blanc G7')) {
        document.body.dataset.sawWhiteReply = 'true';
        observer.disconnect();
      }
    });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Lecture', exact: true }).click();
  const simulation = page.locator('.simulation');
  await expect(simulation.getByRole('heading')).toContainText('Noir · avant le coup 87', {
    timeout: 30_000,
  });
  await expect(page.locator('.stage')).toHaveAttribute('data-simulation', 'true');
  await expect(goban).toHaveCount(1);
  await expect(simulation.getByRole('heading')).not.toBeFocused();
  expect(await goban.boundingBox()).toEqual(position);
  await expectDockedGoban(page, simulation);
  await expect(simulation.locator('canvas, svg:not(button svg)')).toHaveCount(0);
  const started = performance.now();
  const variant = simulation.locator('.simulation__view');
  await expect(variant).toHaveAttribute('data-branch', '1', { timeout: 60_000 });
  console.log(
    'Première branche du coup 87 visible après ' + Math.round(performance.now() - started) + ' ms',
  );
  await expect(simulation.locator('.simulation__view')).toHaveAttribute(
    'data-step',
    /^(?:[1-9]|1[0-9]|20)$/,
    {
      timeout: 20_000,
    },
  );
  await expect(slider).toHaveValue('86');
  await simulation.getByRole('button', { name: 'Pause des variantes' }).click();
  const pausedStep = await variant.getAttribute('data-step');
  const compare = simulation.getByRole('button', { name: 'Position initiale' });
  await compare.click();
  await expect(compare).toHaveAttribute('aria-pressed', 'true');
  await expect(variant).toHaveAttribute('data-step', '0');
  await expect(variant).toContainText('Position initiale · coups du kifu');
  await expect(slider).toHaveValue('86');
  await compare.click();
  await expect(variant).toHaveAttribute('data-step', pausedStep!);
  await expect(variant).toContainText('Coup simulé ·');
  await expect(simulation.getByRole('button', { name: 'Coup simulé suivant' })).toBeVisible();
  await simulation.getByRole('button', { name: 'Lire les variantes' }).click();
  for (let i = 2; i <= 10; i++) {
    await expect(variant).toHaveAttribute('data-branch', String(i), { timeout: 60_000 });
  }
  await expect(simulation.getByRole('heading')).toContainText('Blanc · avant le coup 88', {
    timeout: 90_000,
  });
  await expect(slider).toHaveValue('87');
  await expect(page.locator('body')).toHaveAttribute('data-saw-black-move', 'true');
  await simulation.getByRole('button', { name: 'Jouer le coup du kifu' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-saw-white-reply', 'true', {
    timeout: 15_000,
  });
});

test('une panne du réseau de variantes conserve la réflexion et permet de la relancer', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const weights = '**/leela-zero.onnx';
  await page.context().route(weights, (route) => route.fulfill({ status: 503 }));
  await enter(page);
  await page.getByRole('button', { name: 'Partie suivante' }).click();
  const kifu = page.locator('input[aria-label="Coup"]');
  await kifu.fill('86');
  await page.getByRole('button', { name: 'Lecture', exact: true }).click();

  const simulation = page.getByRole('region', { name: 'Noir · avant le coup 87' });
  const retry = simulation.getByRole('button', { name: 'Réessayer les simulations' });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await expect(simulation.getByRole('status')).toContainText('Leela Zero');
  // L'ancienne sortie automatique révélait le coup après 750 ms d'écran vide.
  await page.waitForTimeout(1500);
  await expect(retry).toBeVisible();
  await expect(kifu).toHaveValue('86');
  await expect(simulation.locator('.simulation__view')).toHaveAttribute('data-step', '0');

  await page.context().unroute(weights);
  const loaded = page.context().waitForEvent('response', {
    predicate: (response) => response.url().endsWith('/leela-zero.onnx') && response.ok(),
    timeout: 60_000,
  });
  await retry.click();
  await loaded;
  const view = simulation.locator('.simulation__view');
  await expect(view).toHaveAttribute('data-branch', '1', { timeout: 60_000 });
  await expect(retry).toHaveCount(0);
  await expect(view.getByText('Avance estimée')).toBeVisible({ timeout: 60_000 });
  await simulation.getByRole('button', { name: 'Coup simulé suivant' }).click();
  await expect(view).toContainText('Coup simulé');
  await expect(kifu).toHaveValue('86');
  await simulation.getByRole('button', { name: 'Jouer le coup du kifu' }).click();
  await expect(kifu).toHaveValue('87');
});

test('le pupitre d’estimation suit le goban sur portable et mobile', async ({ page }) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await enter(page);
  const library = page.locator('.topbar').getByRole('button', { name: 'Parties', exact: true });
  await library.click();
  await page.getByRole('button', { name: 'Partie suivante' }).click();
  const move = page.getByRole('slider', { name: 'Coup', exact: true });
  const canvas = page.locator('canvas[data-rendered="true"]');
  const simulation = page.getByRole('region', { name: 'Noir · avant le coup 87' });
  const settings = simulation.locator('details.simulation__study');
  const branches = simulation.getByRole('combobox', { name: 'Variante affichée' });
  const play = simulation.getByRole('button', { name: 'Lire les variantes' });
  const back = simulation.getByRole('button', { name: 'Jouer le coup du kifu' });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const open of [true, false]) {
      const app = page.locator('.app');
      if ((await app.getAttribute('data-panel')) !== (open ? 'open' : 'closed')) {
        if (open) await library.click();
        else await page.getByRole('button', { name: 'Fermer le volet' }).click();
      }
      await expect(app).toHaveAttribute('data-panel', open ? 'open' : 'closed');
      await move.fill('85');
      await page.getByRole('button', { name: 'Coup suivant', exact: true }).click();
      await expect(move).toHaveValue('86');
      const board = await page.locator('.stage__canvas').boundingBox();
      await expect.poll(() => canvas.boundingBox()).toEqual(board);

      await page.getByRole('button', { name: 'Voir les simulations' }).click();
      await expect(simulation.getByRole('heading')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(simulation.getByRole('heading')).toHaveText('Noir · avant le coup 87');
      await expect(page.locator('input[aria-label="Coup"]')).toHaveValue('86');
      await expect(branches).toBeVisible({ timeout: 60_000 });
      await expect(settings).not.toHaveAttribute('open', '');
      await expect.poll(() => canvas.boundingBox()).toEqual(board);
      await expectDockedGoban(page, simulation);
      for (const control of [branches, play, back]) {
        await expect(control).toBeInViewport({ ratio: 1 });
        await control.click({ trial: true });
      }

      if (size.width === 390 && !open) {
        const projection = simulation.getByRole('slider', { name: 'Coup de la variante' });
        await expect
          .poll(async () => Number(await projection.getAttribute('max')))
          .toBeGreaterThanOrEqual(2);
        await projection.fill('2');
        await expect(simulation.locator('.simulation__view')).toHaveAttribute('data-step', '2');
        await expect(branches).toBeInViewport({ ratio: 1 });
      }
      if (size.width === 1280 && open) {
        await branches.selectOption('1', { timeout: 60_000 });
        await expect(simulation.locator('.simulation__view')).toHaveAttribute('data-branch', '2');
      }
      await settings.locator('summary').click();
      await simulation.getByLabel('Profondeur de la variante').selectOption('32');
      const extend = simulation.getByRole('button', { name: 'Prolonger la variante' });
      await extend.click({ trial: true });
      await expect(back).toBeInViewport({ ratio: 1 });
      await expectDockedGoban(page, simulation);
      if (size.width === 390 && open) {
        await page.getByRole('button', { name: 'Fermer le volet' }).click();
        await expect(app).toHaveAttribute('data-panel', 'closed');
        await expect(simulation.getByRole('heading')).toHaveText('Noir · avant le coup 87');
        await expect(back).toBeInViewport({ ratio: 1 });
      }
      await back.focus();
      await page.keyboard.press('Enter');
      await expect(move).toHaveValue('87');
      await expect(move).toBeFocused();
    }
  }
});

test('import SGF local, bibliothèque persistante et entraînement avec le camp choisi', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Importer un SGF', exact: true }).click();
  const file = page.getByLabel('Importer un fichier SGF');
  await file.setInputFiles({
    name: 'petit.sgf',
    mimeType: 'application/x-go-sgf',
    buffer: Buffer.from('(;SZ[9];B[cc])'),
  });
  await expect(page.getByRole('alert')).toContainText('19 × 19');
  await file.setInputFiles({
    name: 'finale.sgf',
    mimeType: 'application/x-go-sgf',
    buffer: Buffer.from(
      '(;FF[4]GM[1]CA[UTF-8]SZ[19]PB[Alice]PW[Émile]KM[6.5];B[pd];W[dd];B[ab];W[bb];B[ba];W[dp];B[cb];W[pp];B[bc])',
    ),
  });

  const card = page.getByRole('region', { name: 'Partie en cours' });
  await expect(card).toContainText('Alice');
  await expect(card).toContainText('Émile');
  await expect(card).toContainText('6,5');
  await expect(card).not.toContainText('Shūsaku');
  await page.getByRole('button', { name: 'Deviner', exact: true }).click();
  await page.getByLabel('Camp à deviner').selectOption('W');
  await expect(page.getByRole('heading', { name: 'Jouer comme Émile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Montrer le coup' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Montrer le coup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Émile a joué' })).toContainText('D16');

  await page.reload();
  await page.getByRole('button', { name: 'Importer un SGF', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes parties' })).toBeVisible();
  await page.getByRole('searchbox').fill('Émile');
  await page.getByRole('button', { name: /Alice — Émile/ }).click();
  await expect(card).toContainText('Émile');
});

test('Leela Zero lit une partie importée, projette ses coups et rend la main au kifu', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Importer un SGF', exact: true }).click();
  await page.getByLabel('Importer un fichier SGF').setInputFiles({
    name: 'leela.sgf',
    mimeType: 'application/x-go-sgf',
    buffer: Buffer.from('(;SZ[19]PB[Alice]PW[Émile]KM[0.5];B[pd];W[dd];B[qp];W[dp])'),
  });
  await page.getByRole('slider', { name: 'Coup', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await page.getByRole('button', { name: 'Lire 60 coups d’avance' }).click();
  const reading = page.getByRole('region', { name: 'Lecture longue' });
  await expect(reading.getByRole('radio', { name: 'Leela Zero' })).toBeChecked();
  await expect(reading).toContainText('komi fixe de 7,5');
  await reading.getByRole('button', { name: 'Lancer Leela Zero' }).click();
  await expect(reading.getByLabel('Recherche par position')).toHaveValue('32', { timeout: 60_000 });
  await reading.getByRole('button', { name: 'Calculer la suite' }).click();
  const choices = reading.locator('.analysis__choice');
  await expect(choices.first()).toContainText('Chances de Noir', { timeout: 60_000 });
  await expect(choices.first()).toContainText('visite');
  const chosen = await choices.first().locator('strong').innerText();
  await reading.getByRole('button', { name: 'Arrêter le calcul' }).click();
  await reading.getByRole('button', { name: 'Avancer' }).click();
  await expect(reading.getByRole('heading', { name: 'Noir ' + chosen, exact: true })).toBeVisible();
  await expect(reading.getByRole('button', { name: 'Territoires estimés' })).toHaveCount(0);
  await reading.getByLabel('Recherche par position').selectOption('128');
  await expect(reading.getByRole('slider')).toHaveCount(0);
  await reading.getByRole('button', { name: 'Revenir à l’analyse' }).click();
  await page.getByRole('button', { name: 'Revenir au kifu' }).click();
  await expect(page.getByRole('slider', { name: 'Coup', exact: true })).toHaveValue('2');
});

test('après un abandon, calculer une suite et retrouver le dernier coup du SGF', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Importer un SGF', exact: true }).click();
  const filter = page.getByRole('checkbox', { name: 'Parties terminées par abandon' });
  await filter.check();
  await expect(page.locator('.library__count')).toContainText('178 parties');
  await page.getByLabel('Importer un fichier SGF').setInputFiles('data/cwi/007.sgf');
  const card = page.getByRole('region', { name: 'Partie en cours' });
  await card.getByRole('button', { name: 'Continuer après l’abandon' }).click();
  const reading = page.getByRole('region', { name: 'Lecture longue' });
  await expect(reading).toContainText('Dernier coup enregistré · 194');
  await expect(reading).toContainText('Blanc au trait');
  await reading.getByRole('button', { name: 'Comparer 10 variantes de 20 coups' }).click();
  const comparison = page.getByRole('region', { name: 'Variantes après l’abandon' });
  await expect(page.locator('.stage')).toHaveAttribute('data-simulation', 'true');
  const branches = comparison.getByLabel('Variante affichée');
  await expect(branches.locator('option')).toHaveCount(10, { timeout: 240_000 });
  const starts = (await branches.locator('option').allTextContents()).map(
    (label) => label.split(' · ')[1],
  );
  expect(starts.every(Boolean)).toBe(true);
  expect(new Set(starts).size).toBe(10);
  await expect(comparison).toContainText('Meilleur départ sur 10 coups évalués', {
    timeout: 60_000,
  });
  await expect(branches.locator('option').first()).toHaveText(/1 · F7 · [−-]7,3 pt/);
  await expect(branches.locator('option').nth(2)).toHaveText(/3 · E12 · [−-]10,6 pt/);
  await comparison.getByRole('button', { name: 'Voir la variante en F7' }).click();
  const simulated = comparison.locator('.simulation__view');
  await expect(simulated).toContainText('Coup simulé · Blanc F7');
  await expect(simulated.getByText('Avance estimée').locator('..')).toContainText('Noir +45,7 pt');
  await expect(simulated.getByText('Variation pour Blanc').locator('..')).toContainText(
    /[−-]7,3 pt/,
  );
  await expect(simulated.getByText('Komi d’équilibre estimé').locator('..')).toContainText(
    '45,7 pt pour Blanc',
  );
  const projection = comparison.getByRole('slider', { name: 'Coup de la variante' });
  for (let i = 0; i < starts.length; i++) {
    await branches.selectOption(String(i));
    await expect(projection).toHaveAttribute('max', '20', { timeout: 30_000 });
  }
  await projection.fill('20');
  await expect(comparison.locator('.simulation__view')).toHaveAttribute('data-step', '20');
  await comparison.getByRole('button', { name: 'Revenir à la lecture longue' }).click();
  await expect(page.locator('.stage')).toHaveAttribute('data-simulation', 'false');
  await expect(reading).toContainText('Dernier coup enregistré · 194');
  await reading.getByLabel('Profondeur de la suite').selectOption('240');
  await reading.getByLabel('Profondeur de la suite').selectOption('more');
  await expect(reading.getByLabel('Profondeur de la suite')).toHaveValue('300');
  await reading.getByRole('button', { name: 'Calculer la suite après l’abandon' }).click();
  const choices = reading.locator('.analysis__choice');
  await expect(choices.first()).toBeVisible({ timeout: 60_000 });
  await reading.getByRole('button', { name: 'Arrêter le calcul' }).click();
  const first = await choices.first().locator('strong').innerText();
  const count = await choices.count();
  await reading.getByRole('button', { name: 'Chercher d’autres coups' }).click();
  await expect.poll(() => choices.count(), { timeout: 60_000 }).toBeGreaterThan(count);
  expect(await choices.first().locator('strong').innerText()).toBe(first);
  await reading.getByRole('button', { name: 'Revenir au kifu' }).click();
  await expect(page.getByRole('slider', { name: 'Coup', exact: true })).toHaveValue('194');
  await expect(card).toContainText('abandon');
});
