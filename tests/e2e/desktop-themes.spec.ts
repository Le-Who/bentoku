import { expect, test, type Page } from '@playwright/test';

type Theme = 'picnic' | 'porcelain' | 'maple';
interface SceneState {
  selectedPiece: string | null;
  placement: { board: Array<string | null>; moves: number };
  puzzle: { seed: string; solution: string[] };
  pieces: Map<
    string,
    {
      x: number;
      y: number;
      sprite: {
        texture: { key: string; getSourceImage(): { width: number; height: number } };
        displayWidth: number;
        displayHeight: number;
      };
    }
  >;
  bento: { slotWorldPosition(index: number): { x: number; y: number } };
}

const themes = [
  ['picnic', 'Picnic Postcards'],
  ['porcelain', 'Porcelain Logic'],
  ['maple', 'Maple Counter'],
] as const;

test('tall desktop clue cards remain separated from the café map', async ({ page }) => {
  await page.goto('/?seed=BENTO-CLUE-000D&difficulty=clever');
  await ready(page);
  for (const [id, name] of themes) {
    await chooseTheme(page, name, id);
    const cards = await page.evaluate(() => {
      type Node = {
        clue?: unknown;
        list?: Node[];
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      };
      const scene = window.__BENTOKU_GAME__.scene.getScene('PuzzleScene');
      const result: Array<{ x: number; y: number; right: number; bottom: number }> = [];
      const visit = (nodes: Node[], parentX = 0, parentY = 0) =>
        nodes.forEach((node) => {
          const x = parentX + (node.x ?? 0),
            y = parentY + (node.y ?? 0);
          if (node.clue) {
            result.push({
              x: x - node.width! / 2,
              y: y - node.height! / 2,
              right: x + node.width! / 2,
              bottom: y + node.height! / 2,
            });
          }
          if (node.list) visit(node.list, x, y);
        });
      visit(scene.children.list as unknown as Node[]);
      return result;
    });
    expect(cards).toHaveLength(3);
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!,
          b = cards[j]!;
        const clearance = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
        expect(clearance, `${id} separate readable clue cards`).toBeGreaterThanOrEqual(4);
      }
  }
});

async function ready(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (
            window as unknown as {
              __BENTOKU_GAME__?: { scene: { getScene(key: string): SceneState | undefined } };
            }
          ).__BENTOKU_GAME__?.scene.getScene('PuzzleScene')?.puzzle,
        ),
      ),
    )
    .toBe(true);
}

async function openSettings(page: Page) {
  await page.keyboard.press('KeyS');
  const dialog = page.locator('.desktop-settings-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function chooseTheme(page: Page, name: string, id: Theme) {
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: new RegExp(name) }).check();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', id, { timeout: 20000 });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}

const sceneState = (page: Page) =>
  page.evaluate(() => {
    const scene = (
      window as unknown as { __BENTOKU_GAME__: { scene: { getScene(key: string): SceneState } } }
    ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
    return {
      board: [...scene.placement.board],
      moves: scene.placement.moves,
      seed: scene.puzzle.seed,
      selected: scene.selectedPiece,
    };
  });

const screenPoint = (page: Page, x: number, y: number) =>
  page.evaluate(
    ({ x, y }) => {
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: rect.x + (x * rect.width) / 1600, y: rect.y + (y * rect.height) / 900 };
    },
    { x, y },
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=BENTO-E2E-0001&difficulty=gentle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test('desktop settings offers the three appearance themes', async ({ page }) => {
  const dialog = await openSettings(page);
  for (const [, name] of themes) {
    await expect(dialog.getByRole('radio', { name: new RegExp(name) })).toBeVisible();
  }
});

test('switching themes preserves the puzzle, placement, selected piece and undo', async ({
  page,
}) => {
  const puzzle = await page.evaluate(() => {
    const scene = (
      window as unknown as { __BENTOKU_GAME__: { scene: { getScene(key: string): SceneState } } }
    ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
    const first = scene.puzzle.solution[0]!;
    const second = scene.puzzle.solution[1]!;
    return {
      first,
      second,
      firstPoint: { x: scene.pieces.get(first)!.x, y: scene.pieces.get(first)!.y },
      secondPoint: { x: scene.pieces.get(second)!.x, y: scene.pieces.get(second)!.y },
      slot: scene.bento.slotWorldPosition(0),
    };
  });
  const piecePoint = await screenPoint(page, puzzle.firstPoint.x, puzzle.firstPoint.y);
  const slotPoint = await screenPoint(page, puzzle.slot.x, puzzle.slot.y);
  await page.mouse.click(piecePoint.x, piecePoint.y);
  await page.mouse.click(slotPoint.x, slotPoint.y);
  await expect
    .poll(() => sceneState(page))
    .toMatchObject({ moves: 1, board: expect.arrayContaining([puzzle.first]) });
  const secondPoint = await screenPoint(page, puzzle.secondPoint.x, puzzle.secondPoint.y);
  await page.mouse.click(secondPoint.x, secondPoint.y);
  await expect.poll(() => sceneState(page)).toMatchObject({ selected: puzzle.second });
  const before = await sceneState(page);
  for (const [id, name] of themes) {
    await chooseTheme(page, name, id);
    expect(await sceneState(page)).toEqual(before);
  }
  await page.keyboard.press('KeyU');
  await expect
    .poll(() => sceneState(page))
    .toMatchObject({ moves: 0, board: Array(9).fill(null), seed: before.seed });
  await page.reload();
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'maple', {
    timeout: 20000,
  });
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('radio', { name: /Maple Counter/ })).toBeChecked();
});

test('a failed theme load retains the working appearance and preference', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  await page.route('**/themes/maple/board.webp', (route) => route.abort());
  const dialog = await openSettings(page);
  await dialog.getByRole('radio', { name: /Maple Counter/ }).click();
  await expect(dialog.getByRole('status')).toContainText(/could not load/i, { timeout: 20000 });
  await expect(dialog.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
    ),
  ).toBe('porcelain');
});

test('a pending theme cannot override a newer selection after settings reopens', async ({
  page,
}) => {
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/themes/maple/board.webp', async (route) => {
    started();
    await held;
    await route.continue();
  });
  try {
    let dialog = await openSettings(page);
    await dialog.getByRole('radio', { name: /Maple Counter/ }).check();
    await requestStarted;
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
    dialog = await openSettings(page);
    await dialog.getByRole('radio', { name: /Porcelain Logic/ }).check();
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain');
    await expect(dialog.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
      ),
    ).toBe('porcelain');
  } finally {
    release();
  }
});

test('mobile appearance selection carries over when resized to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: /Picnic Postcards/ }).check();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'picnic', {
    timeout: 20000,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'picnic', {
    timeout: 20000,
  });
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('radio', { name: /Picnic Postcards/ })).toBeChecked();
});

for (const [id, name] of themes) {
  test(`${name} renders its actual artwork and retains board geometry at desktop sizes`, async ({
    page,
  }) => {
    await chooseTheme(page, name, id);
    await page.keyboard.press('KeyH');
    await expect
      .poll(() =>
        page.evaluate((theme) => {
          type Display = { visible?: boolean; texture?: { key: string }; list?: Display[] };
          const scene = (
            window as unknown as {
              __BENTOKU_GAME__: { scene: { getScene(key: string): { modal?: Display } } };
            }
          ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
          const containsPrimary = (node?: Display): boolean =>
            Boolean(
              node &&
              node.visible !== false &&
              (node.texture?.key === `skin_${theme}_button-primary` ||
                node.list?.some(containsPrimary)),
            );
          return containsPrimary(scene.modal);
        }, id),
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              window as unknown as {
                __BENTOKU_GAME__: { scene: { getScene(key: string): { modal?: unknown } } };
              }
            ).__BENTOKU_GAME__.scene.getScene('PuzzleScene').modal,
        ),
      )
      .toBe(true);
    for (const [width, height] of [
      [1440, 900],
      [844, 390],
      [1280, 720],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('canvas')).toBeVisible();
      const art = await page.evaluate(() => {
        type Display = {
          type?: string;
          visible?: boolean;
          list?: Display[];
          texture?: { key: string; getSourceImage(): { width: number; height: number } };
          displayWidth?: number;
          displayHeight?: number;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          clue?: unknown;
          getBounds?: () => { x: number; y: number; right: number; bottom: number };
        };
        const scene = (
          window as unknown as {
            __BENTOKU_GAME__: {
              scene: {
                getScene(key: string): SceneState & {
                  children: { list: Display[] };
                  inventory: { list: Display[] };
                };
              };
            };
          }
        ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
        const objects: Display[] = [];
        const clues: { x: number; y: number; right: number; bottom: number }[] = [];
        const visit = (entries: Display[], parentX = 0, parentY = 0) =>
          entries.forEach((entry) => {
            if (entry.visible !== false) {
              objects.push(entry);
              const x = parentX + (entry.x ?? 0);
              const y = parentY + (entry.y ?? 0);
              if (entry.clue && entry.width && entry.height) {
                clues.push({
                  x: x - entry.width / 2,
                  y: y - entry.height / 2,
                  right: x + entry.width / 2,
                  bottom: y + entry.height / 2,
                });
              }
              if (entry.list) visit(entry.list, x, y);
            }
          });
        visit(scene.children.list);
        const images = objects
          .filter((entry) => entry.texture?.key)
          .map((entry) => {
            const bounds = entry.getBounds?.();
            return {
              key: entry.texture!.key,
              width: entry.displayWidth,
              height: entry.displayHeight,
              source: entry.texture!.getSourceImage() && {
                width: entry.texture!.getSourceImage().width,
                height: entry.texture!.getSourceImage().height,
              },
              bounds: bounds && {
                x: bounds.x,
                y: bounds.y,
                right: bounds.right,
                bottom: bounds.bottom,
              },
            };
          });
        return {
          images,
          inventoryWellBounds: scene.inventory.list
            .filter((entry) => entry.texture?.key?.endsWith('_well'))
            .map((entry) => {
              const bounds = entry.getBounds!();
              return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom };
            }),
          clues,
          pieces: [...scene.pieces].map(([piece, view]) => ({
            piece,
            key: view.sprite.texture.key,
            width: view.sprite.displayWidth,
            height: view.sprite.displayHeight,
            source: {
              width: view.sprite.texture.getSourceImage().width,
              height: view.sprite.texture.getSourceImage().height,
            },
          })),
          slots: Array.from({ length: 9 }, (_, i) => scene.bento.slotWorldPosition(i)),
        };
      });
      for (const asset of [
        'desktop-background',
        'board',
        'desktop-panel',
        'logo',
        'desktop-tray',
        'well',
        'button-secondary',
      ]) {
        expect(
          art.images.some((image) => image.key === `skin_${id}_${asset}`),
          `${id}: visible ${asset}`,
        ).toBe(true);
      }
      for (const asset of ['desktop-tray', 'desktop-panel']) {
        const image = art.images.find((image) => image.key === `skin_${id}_${asset}`)!;
        expect(image.width! / image.height!, `${id}: undistorted ${asset}`).toBeCloseTo(
          image.source!.width / image.source!.height,
          3,
        );
      }
      expect(art.pieces).toHaveLength(12);
      for (const piece of art.pieces) {
        expect(piece.key).toBe(`skin_${id}_piece_${piece.piece}`);
        expect(piece.width).toBeGreaterThan(0);
        expect(piece.width / piece.height).toBeCloseTo(1, 2);
        expect(piece.source.width).toBeGreaterThan(0);
        expect(piece.width / piece.height).toBeCloseTo(piece.source.width / piece.source.height, 2);
      }
      const board = art.images.find((image) => image.key === `skin_${id}_board`)!.bounds!;
      for (const slot of art.slots) {
        expect(slot.x).toBeGreaterThan(board.x);
        expect(slot.x).toBeLessThan(board.right);
        expect(slot.y).toBeGreaterThan(board.y);
        expect(slot.y).toBeLessThan(board.bottom);
      }
      const tray = art.images.find((image) => image.key === `skin_${id}_desktop-tray`)!.bounds!;
      const wells = art.inventoryWellBounds;
      expect(wells).toHaveLength(12);
      const panel = art.images.find((image) => image.key === `skin_${id}_desktop-panel`)!.bounds!;
      expect(art.clues.length).toBeGreaterThan(0);
      for (const [child, parent] of [
        ...wells.map((well) => [well, tray] as const),
        ...art.clues.map((clue) => [clue, panel] as const),
      ]) {
        expect(child.x).toBeGreaterThanOrEqual(parent.x);
        expect(child.y).toBeGreaterThanOrEqual(parent.y);
        expect(child.right).toBeLessThanOrEqual(parent.right);
        expect(child.bottom).toBeLessThanOrEqual(parent.bottom);
      }
    }
  });
}

test('startup artwork failure offers a retry that restores a usable desktop', async ({ page }) => {
  await page.route('**/themes/**', (route) => route.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  const retry = page.getByRole('button', { name: /try again/i });
  await expect(retry).toBeVisible({ timeout: 10000 });
  await page.unroute('**/themes/**');
  await retry.click();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  await ready(page);
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('radio', { name: /Porcelain Logic/ })).toBeChecked();
});

test('a pending desktop theme leaves Help open until the player closes it', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/themes/maple/board.webp', async (route) => {
    started();
    await held;
    await route.continue();
  });
  try {
    const dialog = await openSettings(page);
    await dialog.getByRole('radio', { name: /Maple Counter/ }).check();
    await requestStarted;
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press('KeyH');
    const helpOpen = () =>
      page.evaluate(() => {
        type Item = { text?: string; list?: Item[] };
        const scene = (
          window as unknown as {
            __BENTOKU_GAME__: { scene: { getScene(key: string): { modal?: Item } } };
          }
        ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
        const hasHelpTitle = (item?: Item): boolean =>
          Boolean(item && (item.text === 'A note from the café' || item.list?.some(hasHelpTitle)));
        return hasHelpTitle(scene.modal);
      });
    await expect.poll(helpOpen).toBe(true);
    release();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
          ),
        { timeout: 20000 },
      )
      .toBe('maple');
    expect(await helpOpen()).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(helpOpen).toBe(false);
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'maple', {
      timeout: 20000,
    });
  } finally {
    release();
  }
});

test('a newer desktop selection wins over an older pending mobile selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain', {
    timeout: 20000,
  });
  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/themes/maple/board.webp', async (route) => {
    started();
    await held;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: /Maple Counter/ }).check();
    await requestStarted;
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
      timeout: 20000,
    });
    const dialog = await openSettings(page);
    await dialog.getByRole('radio', { name: /Picnic Postcards/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'picnic', {
      timeout: 20000,
    });
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'picnic');
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
      ),
    ).toBe('picnic');
  } finally {
    release();
  }
});

test('a desktop-only load failure after mobile selection offers a usable retry', async ({
  page,
}) => {
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: /Maple Counter/ }).check();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'maple', {
    timeout: 20000,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.route('**/themes/maple/desktop-background.webp', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeHidden();
  const retry = page.getByRole('button', { name: /try again/i });
  await expect(retry).toBeVisible({ timeout: 20000 });
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain');

  const puzzle = await page.evaluate(() => {
    const scene = (
      window as unknown as { __BENTOKU_GAME__: { scene: { getScene(key: string): SceneState } } }
    ).__BENTOKU_GAME__.scene.getScene('PuzzleScene');
    const id = scene.puzzle.solution[0]!;
    const piece = scene.pieces.get(id)!;
    return { id, piece: { x: piece.x, y: piece.y }, slot: scene.bento.slotWorldPosition(0) };
  });
  const piece = await screenPoint(page, puzzle.piece.x, puzzle.piece.y);
  const slot = await screenPoint(page, puzzle.slot.x, puzzle.slot.y);
  await page.mouse.click(piece.x, piece.y);
  await page.mouse.click(slot.x, slot.y);
  await expect
    .poll(() => sceneState(page))
    .toMatchObject({
      moves: 1,
      board: expect.arrayContaining([puzzle.id]),
    });
  await page.unroute('**/themes/maple/desktop-background.webp');
  await retry.click();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'maple', {
    timeout: 20000,
  });
  await expect
    .poll(() => sceneState(page))
    .toMatchObject({
      moves: 1,
      board: expect.arrayContaining([puzzle.id]),
    });
});

test('an older mobile fallback cannot override a renewed desktop choice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: /Picnic Postcards/ }).check();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'picnic', {
    timeout: 20000,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  let release = () => {};
  let started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fallbackStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/themes/picnic/background.webp', (route) => route.abort());
  await page.route('**/themes/porcelain/board.webp', async (route) => {
    started();
    await held;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fallbackStarted;
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'picnic', {
      timeout: 20000,
    });
    const dialog = await openSettings(page);
    // Change away and back so a second explicit selection of the saved look
    // occurs while the older mobile fallback is still pending.
    await dialog.getByRole('radio', { name: /Porcelain Logic/ }).check();
    await dialog.getByRole('radio', { name: /Picnic Postcards/ }).check();
    await expect(dialog.getByRole('radio', { name: /Picnic Postcards/ })).toBeChecked();
    release();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'picnic');
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
      ),
    ).toBe('picnic');
  } finally {
    release();
  }
});

test('returning to mobile can retry a failed new theme without losing the puzzle', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain', {
    timeout: 20000,
  });
  await page.locator('[data-piece-id="cat_rice"]').click();
  await page.locator('[data-cell="0"]').click();
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-desktop-theme', 'porcelain', {
    timeout: 20000,
  });
  await chooseTheme(page, 'Maple Counter', 'maple');
  await page.route('**/themes/maple/background.webp', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mobile Bentoku' })).toBeVisible();
  const retry = page.getByRole('button', { name: /try again/i });
  await expect(retry).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'porcelain');
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();
  await page.locator('[data-piece-id="cat_egg"]').click();
  await page.locator('[data-cell="1"]').click();
  await expect(page.locator('[data-cell="1"] [data-piece-id="cat_egg"]')).toBeVisible();

  await page.unroute('**/themes/maple/background.webp');
  await retry.click();
  await expect(page.locator('.mobile-shell')).toHaveAttribute('data-theme', 'maple', {
    timeout: 20000,
  });
  await expect(page.locator('[data-cell="0"] [data-piece-id="cat_rice"]')).toBeVisible();
  await expect(page.locator('[data-cell="1"] [data-piece-id="cat_egg"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('bentoku.save.v1')!).settings.visualTheme,
    ),
  ).toBe('maple');
});

test('desktop button contents follow the painted face instead of the cast shadow', async ({
  page,
}) => {
  const { paintedButtonBounds } = await import('./button-geometry');
  await page.goto('/?seed=BENTO-MAX1-60BE&difficulty=master');
  await ready(page);
  for (const [id, name] of themes) {
    await chooseTheme(page, name, id);
    const surfaces = {
      well: await paintedButtonBounds(id, 'well'),
      primary: await paintedButtonBounds(id, 'button-primary'),
      secondary: await paintedButtonBounds(id, 'button-secondary'),
    };
    const errors = await page.evaluate((surfaces) => {
      type Node = {
        type: string;
        input?: unknown;
        x: number;
        y: number;
        list?: Node[];
        text?: string;
        texture?: { key: string };
        displayWidth: number;
        displayHeight: number;
      };
      const scene = window.__BENTOKU_GAME__.scene.getScene('PuzzleScene');
      return (scene.children.list as unknown as Node[]).flatMap((node) => {
        if (!node.input) return [];
        const material = node.list?.find((child) =>
          /_(well|button-primary|button-secondary)$/.test(child.texture?.key ?? ''),
        );
        const text = node.list?.find((child) => child.type === 'Text');
        if (!material || !text) return [];
        const icon = material.texture!.key.endsWith('_well');
        const surface = icon
          ? surfaces.well
          : material.texture!.key.endsWith('_button-primary')
            ? surfaces.primary
            : surfaces.secondary;
        // Nine-slice leaves both opaque edge insets intact at the uniform height scale.
        const xScale = icon
          ? material.displayWidth / surface.width
          : material.displayHeight / surface.height;
        const yScale = material.displayHeight / surface.height;
        return [
          {
            label: text.text,
            x: text.x - material.x - (surface.x - surface.width / 2) * xScale,
            y: text.y - material.y - (surface.y - surface.height / 2) * yScale,
          },
        ];
      });
    }, surfaces);
    expect(errors.length).toBeGreaterThanOrEqual(5);
    for (const error of errors) {
      expect(Math.abs(error.x), `${id} ${error.label} horizontal painted center`).toBeLessThan(0.1);
      expect(Math.abs(error.y), `${id} ${error.label} vertical painted center`).toBeLessThan(0.1);
    }
  }
});
