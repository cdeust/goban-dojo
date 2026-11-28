import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeMoves, type Dataset } from '../src/domain/game.ts';
import { schoolPosition, emptyRegion } from '../src/domain/school.ts';
import { pointToHuman } from '../src/domain/board.ts';
import type { RankForm } from '../src/domain/rankAssessment.ts';
const RANK_FORMS = JSON.parse(
  readFileSync(new URL('../src/story/rankCatalog.json', import.meta.url), 'utf8'),
) as RankForm[];
const data = JSON.parse(
  readFileSync(new URL('../public/data/games.json', import.meta.url), 'utf8'),
) as Dataset;
async function enterRank(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer au dojo' }).click();
  const guided = page.getByRole('region', { name: 'Ma prochaine séance' });
  await expect(guided).toContainText('Prochain objectif pédagogique : Objectif 21 kyū');
  await guided.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
}
async function completeInitiation(page: Page, form: RankForm, skipLast = false) {
  await page.getByRole('button', { name: 'Passer l’épreuve : Initiation' }).click();
  for (const [index, item] of form.items.entries()) {
    if (item.kind !== 'school') throw new Error('Expected rule-only initiation');
    const ex = item.exercise;
    const question = page.getByRole('region', { name: `Question ${index + 1}`, exact: true });
    await expect(question).toBeVisible();
    await expect(
      question.getByRole('button', { name: /indice|solution|explication/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Bilan de l’épreuve' })).toHaveCount(0);
    if (skipLast && index === 7) {
      await question.getByRole('button', { name: 'Passer cette question' }).click();
      continue;
    }
    const game = data.games.find((g) => g.id === ex.gameId)!;
    const board = schoolPosition(game, ex.before);
    if (ex.module === 'liberties' || ex.module === 'region-size') {
      const answer =
        ex.module === 'liberties'
          ? board.libertyCount(ex.anchors[0]!)
          : emptyRegion(board, ex.candidate!).points.length;
      await question.getByRole('spinbutton').fill(String(answer));
    } else if (ex.module === 'legality') {
      const legal = !board.clone().play(ex.color, ex.candidate!).illegal;
      await question
        .getByRole('button', { name: legal ? 'Légal' : 'Interdit', exact: true })
        .click();
    } else {
      const point = pointToHuman(decodeMoves(game.moves)[ex.before]!.point);
      const cell = question.getByRole('button', { name: `${point}, vide`, exact: true });
      if (!(await cell.isVisible()))
        await question.getByRole('button', { name: 'Goban entier', exact: true }).click();
      await cell.click();
    }
    await question.getByRole('button', { name: 'Valider ma réponse' }).click();
  }
  await page.getByRole('button', { name: 'Terminer et corriger' }).click();
  return page.getByRole('region', { name: 'Bilan de l’épreuve' });
}

test('épreuves réelles : partie réservée, réponses sans correction, deux formes à des dates distinctes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(2026, 10, 28, 12));
  await enterRank(page);
  await expect(page.getByText('Objectif 21 kyū', { exact: false })).toBeVisible();
  const first = await completeInitiation(page, RANK_FORMS[0]!, true);
  await expect(first).toContainText('Épreuve réussie : 7/8');
  await expect(first.getByRole('button', { name: 'Réviser cette compétence' })).toHaveCount(1);
  await first.getByRole('button', { name: 'Voir mes jalons' }).click();
  await expect(page.getByText(/1 \/ 2 dates avec réussite/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Retour au dojo' }).click();
  const guided = page.getByRole('region', { name: 'Ma prochaine séance' });
  await expect(guided).toContainText('À consolider après votre dernière épreuve');
  await expect(guided.getByRole('button', { name: /^Travailler : / })).toHaveCount(1);
  await guided.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
  await page.clock.setFixedTime(new Date(2026, 10, 29, 12));
  const second = await completeInitiation(page, RANK_FORMS[1]!);
  await expect(second).toContainText('Épreuve réussie : 8/8');
  await expect(second).toContainText('Jalon interne validé');
  await second.getByRole('button', { name: 'Voir mes jalons' }).click();
  await expect(page.getByText(/Jalon interne validé/)).toHaveCount(1);
  await page.getByRole('button', { name: '← Programme' }).click();
  await page.getByRole('button', { name: 'Ouvrir mes évaluations' }).click();
  await expect(page.getByText(/Jalon interne validé/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Retour au dojo' }).click();
  await expect(guided).toContainText('Jalon interne validé : Initiation');
  await expect(guided).toContainText('Objectif 15–10 kyū');
});

test('stratégie évaluée par le moteur KataGo réel après la huitième réponse', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterRank(page);
  await page.getByRole('button', { name: 'Passer l’épreuve : Lecture de combat' }).click();
  const form = RANK_FORMS.find((f) => f.band === 'reading')!;
  for (const [index, item] of form.items.entries()) {
    const question = page.getByRole('region', { name: `Question ${index + 1}`, exact: true });
    if (item.kind === 'strategy' && index === 6) {
      await question
        .getByRole('button', {
          name: `${pointToHuman(item.exercise.historical)}, vide`,
          exact: true,
        })
        .click();
      await question.getByRole('button', { name: 'Valider ma réponse' }).click();
    } else await question.getByRole('button', { name: 'Passer cette question' }).click();
  }
  await expect(page.getByText(/KataGo estime une perte/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminer et corriger' }).click();
  const result = page.getByRole('region', { name: 'Bilan de l’épreuve' });
  await expect(result).toBeVisible({ timeout: 90_000 });
  await expect(result).toContainText(/KataGo estime une perte de \d/);
});
