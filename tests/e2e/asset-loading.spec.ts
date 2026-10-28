import { expect, test, type Page } from '@playwright/test';

const seed = '/?seed=BENTO-E2E-0001&difficulty=gentle';
type Theme = 'porcelain' | 'maple';

async function ready(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (
            window as unknown as {
              __BENTOKU_GAME__?: {
                scene: { getScene(key: string): { puzzle?: unknown } | undefined };
              };
            }
          ).__BENTOKU_GAME__?.scene.getScene('PuzzleScene')?.puzzle,
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20_000,
  });
}

async function openSettings(page: Page) {
  await page.keyboard.press('KeyS');
  const dialog = page.locator('.desktop-settings-dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.locator('.mobile-theme-preview').evaluateAll(
        (images) =>
          images.length === 3 &&
          images.every((image) => {
            const img = image as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          }),
      ),
    )
    .toBe(true);
  return dialog;
}

async function chooseTheme(page: Page, name: string, id: Theme) {
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: new RegExp(name) }).check();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', id, { timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('cold desktop loads only its required WebP artwork', async ({ page }, testInfo) => {
  const images: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && /\.(?:webp|png|jpe?g)$/i.test(url.pathname)) {
      images.push(url.pathname);
    }
  });
  await page.goto(seed);
  await ready(page);
  await page.waitForLoadState('networkidle');
  await testInfo.attach('cold-desktop-images', {
    body: JSON.stringify(images, null, 2),
    contentType: 'application/json',
  });

  expect(images.length).toBeGreaterThan(0);
  expect(images.filter((url) => !url.endsWith('.webp'))).toEqual([]);
  expect(
    images.filter((url) =>
      /\/assets\/(?:pieces\/|environment\/gameplay_plate\.|ui\/tiny_(?:flower|leaf|sparkle)\.)/.test(
        url,
      ),
    ),
  ).toEqual([]);
  expect(images.filter((url) => /\/assets\/themes\/[^/]+\/tray\.webp$/.test(url))).toEqual([]);
  expect(
    images.filter(
      (url) => /\/assets\/themes\/(?:picnic|maple)\//.test(url) && !url.endsWith('/preview.webp'),
    ),
  ).toEqual([]);
  expect(images.some((url) => url.endsWith('/themes/porcelain/desktop-background.webp'))).toBe(
    true,
  );
});

test('revisiting a theme and reopening settings makes no repeat theme image wire loads', async ({
  page,
}, testInfo) => {
  await page.goto(seed);
  await ready(page);
  await chooseTheme(page, 'Maple Counter', 'maple');
  await page.waitForLoadState('networkidle');

  // Resource Timing transferSize is zero for local cache hits; positive values
  // include 304 revalidations, which still cost a network round trip.
  const initialLoads = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => /\/assets\/themes\/maple\/.+\.webp$/.test(entry.name))
      .map((entry) => (entry as PerformanceResourceTiming).transferSize),
  );
  expect(initialLoads.some((bytes) => bytes > 0)).toBe(true);
  await page.evaluate(() => performance.clearResourceTimings());

  await chooseTheme(page, 'Porcelain Logic', 'porcelain');
  const dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.waitForLoadState('networkidle');
  const themeLoads = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => /\/assets\/themes\/.*\.webp$/.test(entry.name))
      .map((entry) => ({
        url: new URL(entry.name).pathname,
        transferSize: (entry as PerformanceResourceTiming).transferSize,
      })),
  );
  await testInfo.attach('revisit-theme-resource-timings', {
    body: JSON.stringify(themeLoads, null, 2),
    contentType: 'application/json',
  });
  expect(themeLoads.filter((entry) => entry.transferSize > 0)).toEqual([]);
});

test('retry after one failed theme image requests only that image again', async ({
  page,
}, testInfo) => {
  await page.goto(seed);
  await ready(page);
  const dialog = await openSettings(page);
  const counts = new Map<string, number>();
  const completed = new Set<string>();
  const failedUrl = '/assets/themes/maple/board.webp';
  page.on('requestfinished', (request) => {
    const url = new URL(request.url()).pathname;
    if (url.startsWith('/assets/themes/maple/') && !url.endsWith('/preview.webp')) {
      completed.add(url);
    }
  });
  // Routing disables HTTP caching, so the second request would expose a
  // missing application-level cache even if the browser normally hides it.
  await page.route('**/assets/themes/maple/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('/preview.webp')) return route.continue();
    counts.set(url, (counts.get(url) ?? 0) + 1);
    if (url === failedUrl && counts.get(url) === 1) return route.abort();
    return route.continue();
  });
  await dialog.getByRole('radio', { name: /Maple Counter/ }).click();
  await expect(dialog.getByRole('status')).toContainText(/could not load/i, { timeout: 20_000 });
  await expect(dialog.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
  await page.waitForLoadState('networkidle');
  await expect.poll(() => completed.size).toBe(counts.size - 1);
  expect(counts.size).toBeGreaterThanOrEqual(20);
  expect(counts.get(failedUrl)).toBe(1);
  const firstAttempt = new Set(counts.keys());

  await dialog.getByRole('radio', { name: /Maple Counter/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'maple', {
    timeout: 20_000,
  });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.waitForLoadState('networkidle');
  await testInfo.attach('maple-retry-requests', {
    body: JSON.stringify(Object.fromEntries(counts), null, 2),
    contentType: 'application/json',
  });
  expect(new Set(counts.keys())).toEqual(firstAttempt);
  expect(counts.get(failedUrl)).toBe(2);
  expect([...counts].filter(([url, count]) => url !== failedUrl && count !== 1)).toEqual([]);
});

test('switching to mobile reuses clue images already loaded by the canvas', async ({ page }) => {
  await page.goto(seed);
  await ready(page);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => performance.clearResourceTimings());
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain', {
    timeout: 20_000,
  });
  await page.waitForLoadState('networkidle');
  const clueTransfers = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => /\/assets\/clues\/.*\.webp$/.test(entry.name))
      .map((entry) => ({
        url: entry.name,
        bytes: (entry as PerformanceResourceTiming).transferSize,
      })),
  );
  expect(clueTransfers.filter(({ bytes }) => bytes > 0)).toEqual([]);
});
