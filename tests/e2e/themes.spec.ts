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
  // A fast failure can restore the old radio before check() observes the click.
  await page.getByRole('radio', { name: /Maple Counter/ }).click();
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
  test(`${id}: inventory materials keep their proportions and clues stay inside the panel`, async ({
    page,
  }) => {
    await page.goto('/?layout=mobile&seed=BENTO-MAX1-60BE&difficulty=master');
    await chooseTheme(page, name, id);
    await expect(page.getByText('Order notes', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tap to enlarge', { exact: true })).toHaveCount(0);
    for (const [piece, cell] of [
      ['cat_rice', 0],
      ['bear_sandwich', 4],
      ['bunny_egg', 8],
    ] as const) {
      await page.locator(`[data-piece-id="${piece}"]`).tap();
      await page.locator(`[data-cell="${cell}"]`).tap();
    }
    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [480, 1024],
      [620, 620],
      [720, 700],
      [568, 320],
      [844, 390],
      [1280, 480],
      [1280, 320],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.mobile-notes')!.getBoundingClientRect();
        const pockets = [...document.querySelectorAll('[data-pocket]')].map((node) => {
          const slot = node.getBoundingClientRect();
          const art = node.querySelector('img')?.getBoundingClientRect();
          return {
            width: slot.width,
            height: slot.height,
            artSize: art ? Math.min(art.width, art.height) : null,
          };
        });
        const clues = [...document.querySelectorAll('[data-clue-id]')].map((node) =>
          node.getBoundingClientRect().toJSON(),
        );
        return { pockets, clues, panel: panel.toJSON() };
      });
      for (const pocket of geometry.pockets) {
        expect(
          Math.abs(pocket.width - pocket.height),
          `${id} ${width}x${height} square well`,
        ).toBeLessThan(1);
        if (pocket.artSize !== null)
          expect(pocket.artSize / pocket.width).toBeGreaterThanOrEqual(0.95);
        expect(pocket.width).toBeGreaterThanOrEqual(40);
      }
      for (const clue of geometry.clues) {
        expect(clue.x - geometry.panel.x).toBeGreaterThanOrEqual(id === 'porcelain' ? 2 : 12);
        expect(geometry.panel.right - clue.right).toBeGreaterThanOrEqual(
          id === 'porcelain' ? 2 : 12,
        );
        expect(clue.y - geometry.panel.y).toBeGreaterThanOrEqual(id === 'porcelain' ? 2 : 12);
        expect(geometry.panel.bottom - clue.bottom).toBeGreaterThanOrEqual(
          id === 'porcelain' ? 2 : 12,
        );
      }
      const paint = await page.evaluate(async (theme) => {
        function pixels(image: HTMLImageElement) {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return {
            data: context.getImageData(0, 0, canvas.width, canvas.height).data,
            width: canvas.width,
            height: canvas.height,
          };
        }
        const center = { picnic: [0.475, 0.475], porcelain: [0.45, 0.45], maple: [0.47, 0.46] }[
          theme
        ]!;
        const errors = [];
        const board = document.querySelector('.mobile-board')!.getBoundingClientRect();
        // Midpoints of the painted compartment floors, measured from source art.
        const floors = {
          picnic: { x: [0.194, 0.499, 0.805], y: [0.193, 0.496, 0.805] },
          porcelain: { x: [0.194, 0.501, 0.805], y: [0.192, 0.494, 0.798] },
          maple: { x: [0.201, 0.502, 0.803], y: [0.195, 0.491, 0.789] },
        }[theme];
        for (const pocket of document.querySelectorAll<HTMLElement>('[data-pocket], [data-cell]')) {
          const image = pocket.querySelector('img');
          if (!image) continue;
          await image.decode();
          const bitmap = pixels(image),
            rect = image.getBoundingClientRect(),
            slot = pocket.getBoundingClientRect();
          let left = bitmap.width,
            top = bitmap.height,
            right = -1,
            bottom = -1;
          for (let y = 0; y < bitmap.height; y++)
            for (let x = 0; x < bitmap.width; x++) {
              if (bitmap.data[(y * bitmap.width + x) * 4 + 3]! < 200) continue;
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          const cell = pocket.dataset.cell === undefined ? undefined : Number(pocket.dataset.cell);
          const expectedX =
            cell === undefined
              ? slot.x + slot.width * center[0]!
              : board.x + board.width * floors.x[cell % 3]!;
          const expectedY =
            cell === undefined
              ? slot.y + slot.height * center[1]!
              : board.y + board.height * floors.y[Math.floor(cell / 3)]!;
          errors.push(
            Math.abs(rect.x + ((left + right + 1) / 2 / bitmap.width) * rect.width - expectedX),
          );
          errors.push(
            Math.abs(rect.y + ((top + bottom + 1) / 2 / bitmap.height) * rect.height - expectedY),
          );
        }
        let minPaperAlpha = 255;
        if (theme !== 'porcelain') {
          const panel = document.querySelector('.mobile-notes')!,
            rect = panel.getBoundingClientRect(),
            style = getComputedStyle(panel, '::before');
          const image = new Image();
          image.src = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)![1]!;
          await image.decode();
          const bitmap = pixels(image);
          const x0 = rect.x + parseFloat(style.left),
            y0 = rect.y + parseFloat(style.top);
          const width = rect.width - parseFloat(style.left) - parseFloat(style.right);
          const height = rect.height - parseFloat(style.top) - parseFloat(style.bottom);
          for (const card of document.querySelectorAll('[data-clue-id]')) {
            const box = card.getBoundingClientRect();
            for (const x of [box.x, box.right])
              for (const y of [box.y, box.bottom]) {
                const px = Math.floor(((x - x0) / width) * bitmap.width),
                  py = Math.floor(((y - y0) / height) * bitmap.height);
                minPaperAlpha = Math.min(
                  minPaperAlpha,
                  bitmap.data[(py * bitmap.width + px) * 4 + 3] ?? 0,
                );
              }
          }
        }
        return { centerError: Math.max(...errors), minPaperAlpha };
      }, id);
      expect(paint.centerError, `${id} ${width}x${height} painted character center`).toBeLessThan(
        0.1,
      );
      expect(
        paint.minPaperAlpha,
        `${id} ${width}x${height} paper beneath clue corners`,
      ).toBeGreaterThanOrEqual(245);
    }
  });

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
