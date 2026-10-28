import type Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseURI = 'http://localhost/';
const board = '/assets/themes/maple/board.webp';
let attempts: Map<string, number>;
let completed: Set<string>;
let failBoardOnce: boolean;

beforeEach(() => {
  vi.resetModules();
  attempts = new Map();
  completed = new Set();
  failBoardOnce = false;
  vi.stubGlobal('document', { baseURI, fonts: { load: () => Promise.resolve([]) } });
  // This is the network boundary: the real loaders still choose URLs, create
  // images and handle asynchronous success or failure themselves.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(value: string) {
      const url = new URL(value, baseURI).pathname;
      const count = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, count);
      queueMicrotask(() => {
        if (url === board && failBoardOnce && count === 1) {
          this.onerror?.();
        } else {
          completed.add(url);
          this.onload?.();
        }
      });
    }
  }
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme image loading', () => {
  it('retries only the failed image after the rest of the mobile theme finishes', async () => {
    failBoardOnce = true;
    const { loadThemeAssets } = await import('../src/mobile/ThemeAssets');
    await expect(loadThemeAssets('maple')).rejects.toThrow();
    expect(attempts.size).toBe(20);
    expect(completed.size).toBe(19);
    expect(attempts.get(board)).toBe(1);

    await loadThemeAssets('maple');
    expect(completed.size).toBe(20);
    expect(attempts.get(board)).toBe(2);
    expect([...attempts].filter(([url, count]) => url !== board && count !== 1)).toEqual([]);
  });

  it('shares already loaded images between desktop and mobile theme presenters', async () => {
    const { loadDesktopTheme } = await import('../src/game/DesktopThemeLoader');
    const { loadThemeAssets } = await import('../src/mobile/ThemeAssets');
    const textures = new Map<string, HTMLImageElement>();
    const scene = {
      textures: {
        exists: (key: string) => textures.has(key),
        addImage: (key: string, image: HTMLImageElement) => textures.set(key, image),
      },
    } as unknown as Phaser.Scene;

    await loadDesktopTheme(scene, 'maple');
    expect(textures.size).toBe(21);
    await loadThemeAssets('maple');

    expect(attempts.size).toBe(23);
    expect([...attempts].filter(([, count]) => count !== 1)).toEqual([]);
    expect(attempts.has('/assets/themes/maple/background.webp')).toBe(true);
    expect(attempts.has('/assets/themes/maple/tray.webp')).toBe(true);
  });
});
