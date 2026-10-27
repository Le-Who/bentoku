import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=BENTO-MAX1-60BE&difficulty=master');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
});

async function chooseTheme(page: Page, name: string, id: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('radio', { name: new RegExp(name) }).check();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', id, { timeout: 20000 });
  await expect(page.getByRole('dialog')).toHaveAttribute('data-theme', id);
  await page.getByRole('button', { name: 'Close', exact: true }).tap();
}

test('offers all three illustrated themes in settings and preserves the game and undo', async ({
  page,
}) => {
  await page.locator('[data-piece-id="cat_rice"]').tap();
  await page.locator('[data-cell="0"]').tap();
  const seed = new URL(page.url()).searchParams.get('seed');
  await chooseTheme(page, 'Picnic Postcards', 'picnic');
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('seed')).toBe(seed);
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(page.locator('[data-cell] [data-piece-id]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'picnic', {
    timeout: 20000,
  });
  await chooseTheme(page, 'Maple Counter', 'maple');
  await chooseTheme(page, 'Porcelain Logic', 'porcelain');
});

test('a failed theme switch keeps the working look and saved preference', async ({ page }) => {
  await page.route('**/themes/maple/board.webp', (route) => route.abort());
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('radio', { name: /Maple Counter/ }).check();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
      ),
    )
    .toBe('porcelain');
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain');
  await expect(page.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
  await expect(page.locator('.mobile-theme-status')).toContainText('could not load');
});

test('a saved theme that cannot load falls back to a complete usable look', async ({ page }) => {
  await page.route('**/themes/maple/board.webp', (route) => route.abort());
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('bentoku.save.v1')!);
    save.settings.visualTheme = 'maple';
    localStorage.setItem('bentoku.save.v1', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain', {
    timeout: 20000,
  });
  await page.locator('[data-piece-id="cat_rice"]').tap();
  await page.locator('[data-cell="0"]').tap();
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();
});

test('pending selection stays coherent when settings rebuild and can be cancelled', async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/themes/maple/board.webp', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await page.getByRole('radio', { name: /Maple Counter/ }).check();
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(page.getByRole('radio', { name: /Maple Counter/ })).toBeChecked();
    await page.getByRole('button', { name: 'Effects: on', exact: true }).tap();
    await expect(page.getByRole('radio', { name: /Maple Counter/ })).toBeChecked();
    await page.getByRole('radio', { name: /Porcelain Logic/ }).check();
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain');
    await expect(page.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
  } finally {
    release();
  }
});

test('resizing during initial fallback does not restart or override the saved-theme load', async ({
  page,
}) => {
  let mapleRequests = 0;
  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fallbackStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/themes/maple/board.webp', (route) => {
    mapleRequests++;
    return mapleRequests === 1 ? route.abort() : route.continue();
  });
  await page.route('**/themes/porcelain/board.webp', async (route) => {
    started();
    await held;
    await route.continue();
  });
  try {
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('bentoku.save.v1')!);
      save.settings.visualTheme = 'maple';
      localStorage.setItem('bentoku.save.v1', JSON.stringify(save));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fallbackStarted;
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(mapleRequests).toBe(1);
    release();
    await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain', {
      timeout: 20000,
    });
  } finally {
    release();
  }
});

for (const [id, name] of [
  ['picnic', 'Picnic Postcards'],
  ['porcelain', 'Porcelain Logic'],
  ['maple', 'Maple Counter'],
] as const) {
  test(`${id}: all real artwork loads and the game fits short and tall phones`, async ({
    page,
  }) => {
    await chooseTheme(page, name, id);
    await expect(page.locator('[data-clue-id]')).toHaveCount(7);
    const images = await page.locator('.mobile-piece-art').evaluateAll((nodes) =>
      nodes.map((node) => {
        const image = node as HTMLImageElement;
        return {
          src: image.getAttribute('src'),
          width: image.naturalWidth,
          complete: image.complete,
        };
      }),
    );
    expect(images).toHaveLength(12);
    for (const image of images) {
      expect(image.src).toContain(`themes/${id}/pieces/`);
      expect(image.complete).toBe(true);
      expect(image.width).toBeGreaterThan(0);
    }
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [568, 320],
      [844, 390],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          page
            .locator('.mobile-shell')
            .evaluate((node) => Math.abs(node.getBoundingClientRect().height - innerHeight)),
        )
        .toBeLessThan(2);
      const bounds = await page.evaluate(() => {
        const nodes = [
          ...document.querySelectorAll(
            '.mobile-header, .mobile-notes, .mobile-board, .mobile-tray, .mobile-toolbar',
          ),
        ];
        const root = document.querySelector('.mobile-shell')!;
        return {
          overflow: root.scrollHeight - root.clientHeight,
          rects: nodes.map((node) => node.getBoundingClientRect().toJSON()),
          targets: [...document.querySelectorAll('[data-clue-id], [data-pocket], [data-cell]')].map(
            (node) => {
              const rect = node.getBoundingClientRect();
              return Math.min(rect.width, rect.height);
            },
          ),
        };
      });
      expect(bounds.overflow).toBeLessThanOrEqual(1);
      expect(Math.min(...bounds.targets), `${id} at ${width}x${height}`).toBeGreaterThanOrEqual(40);
      for (const rect of bounds.rects) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width + 1);
        expect(rect.bottom).toBeLessThanOrEqual(height + 1);
      }
    }
  });
}
