import { expect, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { pointFromHuman } from '../src/domain/board.ts';
import { BOARD_TOP, pointToWorld } from '../src/scene/dimensions.ts';

test('un lien mobile ouvre une position jouable, sans exiger le coup du kifu', async ({
  browser,
}) => {
  test.slow();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('/?partie=s126&coup=126');
    const panel = page.getByRole('region', { name: 'Explorer une autre suite' });
    const live = page.getByTestId('live');
    await expect(live).toContainText(/Coup 126 .*Blanc J5/);
    await expect(panel).toContainText('À vous de jouer avec Noir.');
    await panel.getByLabel('Adversaire').selectOption('free');
    const canvas = page.locator('canvas[data-rendered="true"]');
    await expect(canvas).toBeVisible({ timeout: 45_000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Le goban est absent');
    // Projeter G4 à partir du cadrage de dessus, puis toucher le vrai canvas.
    const aspect = box.width / box.height;
    const target = new Vector3(0, BOARD_TOP - 1, 0);
    const camera = new PerspectiveCamera(30, aspect, 4, 1600);
    camera.position.copy(
      new Vector3(0, 128, 0.6)
        .multiplyScalar(Math.min(2.4, Math.max(1, 1.18 / aspect)))
        .add(target),
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const [x, z] = pointToWorld(pointFromHuman('G4')!);
    const projected = new Vector3(x, BOARD_TOP, z).project(camera);
    await canvas.tap({
      position: {
        x: ((projected.x + 1) * box.width) / 2,
        y: ((1 - projected.y) * box.height) / 2,
      },
    });
    await expect(live).toContainText('Exploration, coup 127 : Noir G4.');
    await expect(panel).toContainText('Dans la partie, noir a joué K11');
    await panel.getByRole('button', { name: 'Revenir à la partie' }).click();
    await expect(live).toContainText(/Coup 126 .*Blanc J5/);
  } finally {
    await context.close();
  }
});

test('un lien hors des bornes laisse l’accueil habituel', async ({ page }) => {
  await page.goto('/?partie=s126&coup=9999');
  await expect(page.getByRole('button', { name: 'Entrer au dojo' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Explorer une autre suite' })).toHaveCount(0);
});
