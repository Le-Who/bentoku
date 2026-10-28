import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=BENTO-MAX1-60BE&difficulty=master');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('canvas')).toBeAttached();
});

test('shows every Master clue and a playable portrait board', async ({ page }) => {
  const game = page.getByRole('region', { name: 'Mobile Bentoku' });
  await expect(game).toBeVisible();
  await expect(game.locator('[data-clue-id]')).toHaveCount(7);
  await expect(game.locator('[data-cell]')).toHaveCount(9);
  await expect(game.locator('[data-pocket]')).toHaveCount(12);
  await expect(page.locator('#rotate-device')).toBeHidden();
  const piece = game.locator('[data-pocket] [data-piece-id]').first();
  await piece.tap();
  await game.locator('[data-cell="0"]').tap();
  await expect(game.locator('[data-cell="0"] [data-piece-id]')).toHaveCount(1);
  await game.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(game.locator('[data-cell="0"] [data-piece-id]')).toHaveCount(0);
});

test('fits all seven clues, board, twelve pockets and tools across phone viewports', async ({
  page,
}) => {
  await expect(page.locator('[data-clue-id]')).toHaveCount(7);
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [430, 932],
    [844, 390],
    [568, 320],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page
          .locator('.mobile-shell')
          .evaluate((el) => Math.abs(el.getBoundingClientRect().height - innerHeight)),
      )
      .toBeLessThan(2);
    const geometry = await page.evaluate(() => {
      const panels = [
        '.mobile-header',
        '.mobile-notes',
        '.mobile-board',
        '.mobile-tray',
        '.mobile-toolbar',
      ].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      });
      const root = document.querySelector('.mobile-shell')!;
      const targets = [
        ...document.querySelectorAll('[data-clue-id], [data-pocket], [data-cell]'),
      ].map((el) => {
        const rect = el.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      });
      return { panels, targets, scroll: root.scrollHeight - root.clientHeight };
    });
    for (const panel of geometry.panels) {
      expect(panel.x, `${width} ${panel.selector}`).toBeGreaterThanOrEqual(0);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.right).toBeLessThanOrEqual(width + 1);
      expect(panel.bottom).toBeLessThanOrEqual(height + 1);
    }
    expect(geometry.scroll, `${width}x${height} overflow`).toBeLessThanOrEqual(1);
    expect(
      Math.min(...geometry.targets.map((target) => Math.min(target.w, target.h))),
    ).toBeGreaterThanOrEqual(40);
  }
});

async function touchDrag(page: Page, source: Locator, target: Locator, cancel = false) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 8,
          y: start.y + ((end.y - start.y) * step) / 8,
        },
      ],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

test('supports touch drag, swaps, return to pockets, cancellation and undo', async ({ page }) => {
  const cat = page.locator('[data-piece-id="cat_egg"]');
  const bear = page.locator('[data-piece-id="bear_egg"]');
  const first = page.locator('[data-cell="0"]');
  const second = page.locator('[data-cell="1"]');
  await expect(cat).toBeVisible();
  await touchDrag(page, cat, first);
  await expect(first.locator('[data-piece-id="cat_egg"]')).toBeVisible();
  await touchDrag(page, bear, second);
  await touchDrag(page, cat, second);
  await expect(first.locator('[data-piece-id="bear_egg"]')).toBeVisible();
  await expect(second.locator('[data-piece-id="cat_egg"]')).toBeVisible();
  await touchDrag(page, cat, page.locator('[data-pocket="cat_egg"]'));
  await expect(page.locator('[data-pocket="cat_egg"] [data-piece-id]')).toBeVisible();
  await touchDrag(page, cat, second, true);
  await expect(second.locator('[data-piece-id]')).toHaveCount(0);
  await expect(page.locator('.mobile-drag-ghost')).toHaveCount(0);
  await cat.tap();
  await second.tap();
  await expect(second.locator('[data-piece-id="cat_egg"]')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(second.locator('[data-piece-id]')).toHaveCount(0);
});

test('preserves the game across rotation and exposes settings, difficulty and hints', async ({
  page,
}) => {
  await page.locator('[data-piece-id="cat_rice"]').tap();
  await page.locator('[data-cell="0"]').tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('slider', { name: 'Music', exact: true })).toBeVisible();
  await dialog.getByRole('slider', { name: 'Music', exact: true }).focus();
  const before = await dialog.getByRole('slider', { name: 'Music', exact: true }).inputValue();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('slider', { name: 'Music', exact: true })).toHaveValue(
    String(Number(before) + 1),
  );
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Hint', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Reveal one', exact: true }).tap();
  await expect(page.locator('.mobile-hint-ghost')).toBeVisible();
  await page.getByRole('button', { name: 'Choose difficulty', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Cozy', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Choose difficulty', exact: true })).toContainText(
    'Cozy',
  );
  await expect(page.locator('[data-cell] [data-piece-id]')).toHaveCount(0);
  await expect(page.locator('.mobile-hint-ghost')).toHaveCount(0);
});

test('completes a real puzzle and can start the next bento', async ({ page }) => {
  await expect(page.locator('[data-clue-id]')).toHaveCount(7);
  const solution = await page.evaluate(
    () =>
      (
        window.__BENTOKU_GAME__.scene.getScene('PuzzleScene') as unknown as {
          puzzle: { solution: string[] };
        }
      ).puzzle.solution,
  );
  for (const [cell, id] of solution.entries()) {
    await page.locator(`[data-piece-id="${id}"]`).tap();
    await page.locator(`[data-cell="${cell}"]`).tap();
    await expect(page.locator(`[data-cell="${cell}"] [data-piece-id="${id}"]`)).toBeVisible();
  }
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Bento complete!', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.mobile-shell')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20_000,
  });
  await expect(page.locator('.desktop-theme-loading')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__BENTOKU_GAME__.scene.getScene('PuzzleScene') as unknown as {
          solved: boolean;
          modal?: unknown;
          pieces: Map<string, { sprite: { texture: { key: string } } }>;
        };
        return (
          scene.solved &&
          Boolean(scene.modal) &&
          [...scene.pieces.values()].every(({ sprite }) =>
            sprite.texture.key.startsWith('skin_porcelain_piece_'),
          )
        );
      }),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByText('Bento complete!', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Next bento', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-cell] [data-piece-id]')).toHaveCount(0);
  await expect(page.locator('[data-pocket] [data-piece-id]')).toHaveCount(12);
});

test('keeps controls reachable when browser chrome leaves a short viewport', async ({ page }) => {
  await expect(page.locator('[data-clue-id]')).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 500 });
  const root = page.locator('.mobile-shell');
  await root.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const toolbar = (await page.locator('.mobile-toolbar').boundingBox())!;
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(500);
  await page.getByRole('button', { name: 'Hint', exact: true }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('cancels a desktop drag when switching to the mobile presenter', async ({ page }) => {
  await expect(page.locator('[data-clue-id]')).toHaveCount(7);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.mobile-shell')).toBeHidden();
  const point = await page.evaluate(() => {
    const scene = window.__BENTOKU_GAME__.scene.getScene('PuzzleScene') as unknown as {
      pieces: Map<string, { x: number; y: number }>;
    };
    const piece = scene.pieces.get('cat_egg')!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.x + (piece.x * rect.width) / 1600, y: rect.y + (piece.y * rect.height) / 900 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y + 20, { steps: 10 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (
            window.__BENTOKU_GAME__.scene.getScene('PuzzleScene') as unknown as {
              dragging?: unknown;
            }
          ).dragging,
        ),
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.up();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__BENTOKU_GAME__.scene.getScene('PuzzleScene') as unknown as {
          dragging?: unknown;
          pieces: Map<string, { x: number; y: number; home: { x: number; y: number } }>;
        };
        const piece = scene.pieces.get('cat_egg')!;
        return (
          !scene.dragging &&
          Math.abs(piece.x - piece.home.x) < 0.1 &&
          Math.abs(piece.y - piece.home.y) < 0.1
        );
      }),
    )
    .toBe(true);
});

test('enlarges a real clue and closes it without changing the board', async ({ page }) => {
  await page.locator('[data-clue-id]').first().tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mobile-clue-grid')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-cell] [data-piece-id]')).toHaveCount(0);
});
