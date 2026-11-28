import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// These credentials belong only to the disposable local Supabase test stack.
const url = process.env.VITE_GOBAN_API_URL;
const key = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!url || new URL(url).origin !== 'http://127.0.0.1:55421' || !key) {
  throw new Error('Le serveur Auth local isolé est requis.');
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Dojo-${randomUUID()}!`;

const observed = new WeakMap<Page, string[]>();
function watchGateway(page: Page) {
  const unexpected: string[] = [];
  observed.set(page, unexpected);
  page.on('request', (request) => {
    const target = new URL(request.url());
    const publicConfirmation =
      request.isNavigationRequest() && target.pathname === '/auth/v1/verify';
    if (
      target.origin === url &&
      ((!target.pathname.startsWith('/functions/v1/') && !publicConfirmation) ||
        Boolean(request.headers()['apikey']))
    )
      unexpected.push(target.pathname);
  });
}
function checkGateway(page: Page) {
  expect(observed.get(page) ?? []).toEqual([]);
}
async function signIn(page: Page, email: string) {
  watchGateway(page);
  await page.goto('/');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText('Progression synchronisée')).toBeVisible();
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  await page.getByRole('button', { name: 'Entrer dans l’école' }).click();
  checkGateway(page);
}

test('un visiteur mobile accède directement à une position partagée après le choix de session', async ({
  page,
}) => {
  watchGateway(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?partie=s126&coup=126');
  await page.getByRole('button', { name: 'Continuer en visiteur' }).click();
  const panel = page.getByRole('region', { name: 'Explorer une autre suite' });
  await expect(panel).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('live')).toContainText(/Coup 126 .*Blanc J5/);
  await expect(panel).toContainText('À vous de jouer avec Noir.');
  await expect(panel).toContainText('Dans la partie, noir a joué K11');
  await expect(page.getByRole('button', { name: 'Entrer au dojo' })).toHaveCount(0);
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible({ timeout: 45_000 });
  checkGateway(page);
});

test('une progression réelle est retrouvée sur un autre navigateur, mais pas sur un autre compte', async ({
  browser,
}) => {
  const emails = [
    `dojo-a-${randomUUID()}@example.invalid`,
    `dojo-b-${randomUUID()}@example.invalid`,
  ];
  const ids: string[] = [];
  const contexts = [];
  try {
    for (const email of emails) {
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error || !result.data.user)
        throw new Error('Impossible de préparer le compte de test.');
      ids.push(result.data.user.id);
    }
    const first = await browser.newContext();
    contexts.push(first);
    const one = await first.newPage();
    await one.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(one, emails[0]!);
    await one.getByRole('button', { name: 'Commencer ma séance' }).click();
    await one.getByRole('button', { name: '4', exact: true }).click();
    await expect(one.getByRole('status')).toContainText('Réussi sans aide');
    await one.getByRole('button', { name: '← Programme' }).click();
    await expect(one.getByText('1 / 844', { exact: false }).first()).toBeVisible();
    await expect(one.getByText('Progression synchronisée')).toBeVisible();
    await one.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
    await one.getByRole('button', { name: 'Passer l’épreuve : Initiation' }).click();
    await one.getByRole('button', { name: 'Passer cette question' }).click();
    await expect(one.getByRole('region', { name: 'Question 2', exact: true })).toBeVisible();
    await expect(one.getByText('Progression synchronisée')).toBeVisible();
    // A truly separate browser context, with no copied browser storage.
    const second = await browser.newContext();
    contexts.push(second);
    const two = await second.newPage();
    await two.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(two, emails[0]!);
    await expect(two.getByText('1 / 844', { exact: false }).first()).toBeVisible();
    await two.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
    await expect(two.getByRole('region', { name: 'Question 2', exact: true })).toBeVisible();
    await two.getByRole('button', { name: '← Programme' }).click();
    await two.getByRole('button', { name: 'Retour au dojo' }).click();
    const guided = two.getByRole('region', { name: 'Ma prochaine séance' });
    await expect(guided).toContainText('1 / 844 exercices travaillés');
    await expect(guided).toContainText('Niveau conseillé : 1 / 9');
    await guided.getByRole('button', { name: 'Reprendre mon épreuve' }).click();
    await expect(two.getByRole('region', { name: 'Question 2', exact: true })).toBeVisible();
    await two.getByRole('button', { name: '← Programme' }).click();
    const download = two.waitForEvent('download');
    await two.getByRole('button', { name: 'Exporter la progression' }).click();
    const backup = await (await download).path();
    if (!backup) throw new Error('Sauvegarde absente.');
    await two.getByLabel('Restaurer une sauvegarde de l’école').setInputFiles({
      name: 'invalide.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":2}'),
    });
    await expect(two.getByRole('status')).toContainText('Votre progression n’a pas changé');
    await two.getByLabel('Restaurer une sauvegarde de l’école').setInputFiles(backup);
    await two.getByRole('button', { name: 'Remplacer la progression' }).click();
    await expect(two.getByText('1 / 844', { exact: false }).first()).toBeVisible();
    await expect(two.getByText('Progression synchronisée')).toBeVisible();
    await two.goto('/?partie=s126&coup=126');
    await expect(two.getByRole('region', { name: 'Explorer une autre suite' })).toBeVisible();
    await expect(two.getByTestId('live')).toContainText(/Coup 126 .*Blanc J5/);
    await expect(two.getByText('Progression synchronisée')).toBeVisible();

    const third = await browser.newContext();
    contexts.push(third);
    const three = await third.newPage();
    await three.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(three, emails[1]!);
    await expect(three.getByText('0 / 844', { exact: false }).first()).toBeVisible();
    await three.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
    await expect(three.getByText('Aucune épreuve passée.')).toBeVisible();
    await three.getByRole('button', { name: '← Programme' }).click();
    await three.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(three.getByRole('heading', { name: 'Retrouver ma progression' })).toBeVisible();
    await three.getByRole('button', { name: 'Continuer en visiteur' }).click();
    await three.getByRole('button', { name: 'Entrer au dojo' }).click();
    await three.getByRole('button', { name: 'Entrer dans l’école' }).click();
    await expect(three.getByText('0 / 844', { exact: false }).first()).toBeVisible();
    await expect(three.getByRole('button', { name: 'Exporter la progression' })).toBeDisabled();
    for (const page of [one, two, three]) checkGateway(page);
  } finally {
    for (const context of contexts) await context.close();
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
});

test('une partie contre Leela et son kifu sont repris par le même compte après changement de navigateur', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const email = `dojo-match-${randomUUID()}@example.invalid`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user) throw new Error('Impossible de préparer le compte de test.');
  const contexts = [];
  try {
    const first = await browser.newContext();
    contexts.push(first);
    const one = await first.newPage();
    await one.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(one, email);
    await one.getByRole('button', { name: 'Jouer une partie complète' }).click();
    const training = one.getByRole('region', { name: 'Partie d’entraînement' });
    await training.getByLabel(/Budget de recherche de la prochaine partie/).selectOption('8');
    await training.getByRole('button', { name: 'Jouer Noir' }).click();
    await training
      .getByRole('group', { name: 'Goban interactif' })
      .getByRole('button', { name: 'D4, vide', exact: true })
      .click();
    await expect(training.getByRole('status')).toContainText('2 coups', { timeout: 90_000 });
    await expect(one.getByText('Progression synchronisée')).toBeVisible();
    const next = await browser.newContext();
    contexts.push(next);
    const two = await next.newPage();
    await two.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(two, email);
    await two.getByRole('button', { name: 'Jouer une partie complète' }).click();
    const resumed = two.getByRole('region', { name: 'Partie d’entraînement' });
    await expect(resumed.getByRole('status')).toContainText('2 coups');
    await expect(
      resumed.getByRole('button', { name: 'D4, Noir, coup 1', exact: true }),
    ).toBeVisible();
    two.once('dialog', (dialog) => dialog.accept());
    await resumed.getByRole('button', { name: 'Abandonner', exact: true }).click();
    await expect(resumed.getByText('Blanc gagnant par abandon')).toBeVisible();
    await expect(two.getByText('Progression synchronisée')).toBeVisible();
    checkGateway(one);
    checkGateway(two);
    await first.close();
    const fresh = await browser.newContext();
    contexts.push(fresh);
    const three = await fresh.newPage();
    await three.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(three, email);
    await three.getByRole('button', { name: 'Jouer une partie complète' }).click();
    await expect(three.getByRole('region', { name: 'Partie d’entraînement' })).toContainText(
      'Blanc gagnant par abandon',
    );
    checkGateway(three);
  } finally {
    for (const context of contexts) await context.close();
    await admin.auth.admin.deleteUser(user.data.user.id);
  }
});

async function localMailLink(email: string, type: 'signup' | 'recovery'): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `http://127.0.0.1:55424/view/latest.html?query=${encodeURIComponent(`to:${email}`)}`,
        );
        if (!response.ok) return false;
        const html = await response.text();
        for (const match of html.matchAll(/href="([^"]+)"/g)) {
          try {
            const candidate = new URL(match[1]!.replaceAll('&amp;', '&'));
            if (
              candidate.origin === url &&
              candidate.pathname === '/auth/v1/verify' &&
              candidate.searchParams.get('type') === type
            ) {
              link = candidate.href;
              return true;
            }
          } catch {
            /* Only accept a valid local confirmation URL. */
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  if (!link) throw new Error('Lien de courrier local absent.');
  return link;
}

test('inscription, confirmation e-mail et nouveau mot de passe avec de vrais messages locaux', async ({
  page,
}) => {
  const email = `dojo-register-${randomUUID()}@example.invalid`;
  const newPassword = `Dojo-${randomUUID()}!`;
  watchGateway(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Vérifiez votre messagerie');
    await page.goto(await localMailLink(email, 'signup'));
    await expect(page.getByText('Progression synchronisée')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('status')).toContainText(
      'une demande de récupération a été envoyée',
    );
    await page.goto(await localMailLink(email, 'recovery'));
    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel('Mot de passe', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Modifier le mot de passe' }).click();
    await expect(page.getByText('Progression synchronisée')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await expect(page.getByText('Progression synchronisée')).toBeVisible({ timeout: 30_000 });
    checkGateway(page);
  } finally {
    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users.find((item) => item.email === email);
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
});
