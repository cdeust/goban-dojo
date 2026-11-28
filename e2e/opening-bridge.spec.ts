import { expect, test } from '@playwright/test';
import { pointToHuman } from '../src/domain/board.ts';
import { readFileSync } from 'node:fs';
import type { StrategyLesson } from '../src/story/strategyCourse.ts';

const strategyCatalog = JSON.parse(
  readFileSync('src/story/strategyCatalog.json', 'utf8'),
) as StrategyLesson[];

const opening = strategyCatalog.find((lesson) => lesson.module === 'opening-lines')!;
const title = 'Premiers coups : coins, côtés et centre';

test('l’ouverture se travaille dès le niveau 2 et la suite historique se rejoue sans moteur', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  await page.getByRole('button', { name: 'Entrer dans l’école' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: `Travailler : ${title}`, exact: true }).click();
  await expect(page.getByText(`Niveau 2 · ${title}`, { exact: true })).toBeVisible();
  const board = page.getByRole('group', { name: 'Position du kifu, goban interactif' });
  await page.getByRole('button', { name: 'Étudier la suite sans évaluation' }).click();
  await expect(
    page.getByText('Suite historique consultée sans évaluation : cette séance sera à réviser.'),
  ).toBeVisible();
  const replay = page.getByRole('region', { name: 'Suite historique' });
  for (const [i, move] of opening.evidence.historicalLine.entries()) {
    if (i > 0) await replay.getByRole('button', { name: 'Coup suivant du kifu' }).click();
    await expect(replay.getByRole('status')).toContainText(`Coup ${opening.before + i + 1} :`);
    const color = move.color === 'B' ? 'noir' : 'blanc';
    await expect(
      board.getByRole('button', {
        name: `${pointToHuman(move.point)}, ${color}, coup ${opening.before + i + 1}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(replay.getByRole('button', { name: 'Coup suivant du kifu' })).toBeDisabled();
  for (let i = 0; i < 5; i++) await replay.getByRole('button', { name: 'Coup précédent' }).click();
  await expect(replay.getByRole('status')).toContainText(`Avant le coup ${opening.before + 1}`);
  await expect(replay.getByRole('button', { name: 'Coup précédent' })).toBeDisabled();
  await expect(
    board.getByRole('button', { name: `${pointToHuman(opening.historical)}, vide`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '← Programme' }).click();
  const moduleCard = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: title }) });
  await expect(moduleCard).toContainText('1 / 12 travaillés · 0 au premier essai');
});

test('les nouvelles décisions de fuseki font une comparaison réelle KataGo et permettent de revoir le choix historique', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  await page.getByRole('button', { name: 'Entrer dans l’école' }).click();
  await page.getByRole('button', { name: `Travailler : ${title}`, exact: true }).click();
  const chosen = [...new Set([opening.historical, ...opening.alternatives])].sort(
    (a, b) => a - b,
  )[0]!;
  await page.getByRole('button', { name: `A · ${pointToHuman(chosen)}`, exact: true }).click();
  const results = page.getByRole('table', { name: 'Comparaison stratégique KataGo' });
  await expect(results).toBeVisible({ timeout: 60_000 });
  await expect(results.getByRole('row')).toHaveCount(
    1 + new Set([opening.historical, ...opening.alternatives]).size,
  );
  await expect(
    page.getByText('Ce n’est pas une preuve de joseki ou de stratégie optimale.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Voir le coup historique' }).click();
  await page.getByRole('button', { name: 'Coup suivant du kifu' }).click();
  await expect(
    page.getByRole('region', { name: 'Suite historique' }).getByRole('status'),
  ).toContainText(`Coup ${opening.before + 2} :`);
  await page.getByRole('button', { name: 'Voir mon coup' }).click();
  await expect(page.getByRole('region', { name: 'Suite historique' })).toHaveCount(0);
});

test('Sensei sur mobile : les deux suites sont réellement lues par Leela Zero et comparées par KataGo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  await page.getByRole('button', { name: 'Entrer dans l’école' }).click();
  await page.getByRole('button', { name: `Travailler : ${title}`, exact: true }).click();
  const chosen = [...new Set([opening.historical, ...opening.alternatives])].sort(
    (a, b) => a - b,
  )[0]!;
  await page.getByRole('button', { name: `A · ${pointToHuman(chosen)}`, exact: true }).click();
  const coach = page.getByRole('region', { name: 'Que se passe-t-il après votre coup ?' });
  await coach.getByRole('button', { name: 'Comparer les suites avec le Sensei' }).click();
  await expect(
    coach.getByRole('table', { name: 'Mesures de structure des deux variantes' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(coach.getByText('Estimation KataGo, séparée des faits')).toBeVisible();
  await expect(coach.getByRole('status')).toContainText(`Coup ${opening.before + 1} :`);
  const board = coach.getByRole('group', { name: 'Position du kifu, goban interactif' });
  await expect(
    board.getByRole('button', {
      name: `${pointToHuman(chosen)}, ${opening.color === 'B' ? 'noir' : 'blanc'}, coup ${opening.before + 1}`,
      exact: true,
    }),
  ).toBeVisible();
  for (let i = 2; i <= 5; i++)
    await coach.getByRole('button', { name: 'Coup suivant de la variante' }).click();
  await expect(coach.getByRole('status')).toContainText('5/5');
  await expect(coach.getByRole('button', { name: 'Coup suivant de la variante' })).toBeDisabled();
  await coach.getByRole('button', { name: /^(Autre candidat|Coup du kifu) · / }).click();
  await expect(coach.getByRole('status')).toContainText('5/5');
  await coach.getByRole('button', { name: 'Coup précédent de la variante' }).click();
  await expect(coach.getByRole('status')).toContainText('4/5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('deux vrais kifus et le benchmark du Sensei sont lisibles depuis l’école', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  await page.getByRole('button', { name: 'Entrer dans l’école' }).click();
  const evidence = page.getByRole('region', { name: 'Comment le Sensei vérifie ses conseils' });
  await evidence.getByText('Benchmark public : 152 décisions professionnelles').click();
  await expect(evidence.getByText('77 coups identiques')).toBeVisible();
  await expect(evidence).toContainText('9 meilleurs d’au moins 2 points');
  await expect(evidence).toContainText('7 moins bons d’au moins 2 points');
  await page.getByRole('button', { name: 'Étudier les deux ouvertures' }).click();
  const study = page.getByRole('region', { name: 'Un même goban, deux plans d’ouverture' });
  await expect(study.getByRole('status')).toContainText('Coup 7 : Noir P16');
  await expect(
    study
      .getByRole('group', { name: 'Position du kifu, goban interactif' })
      .getByRole('button', { name: 'P16, noir, coup 7', exact: true }),
  ).toBeVisible();
  await study.getByRole('button', { name: 'Coup suivant du kifu' }).click();
  await expect(study.getByRole('status')).toContainText('Coup 8 : Blanc C6');
  await study.getByRole('button', { name: /D5$/ }).click();
  await expect(study.getByRole('status')).toContainText('Coup 8 : Blanc P17');
  await study.getByRole('button', { name: 'Coup précédent du kifu' }).click();
  await expect(study.getByRole('status')).toContainText('Coup 7 : Noir D5');
  await expect(
    study
      .getByRole('group', { name: 'Position du kifu, goban interactif' })
      .getByRole('button', { name: 'D5, noir, coup 7', exact: true }),
  ).toBeVisible();
});
