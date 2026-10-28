import type Phaser from 'phaser';
import { ANIMALS, FOODS } from '../puzzle/types';
import type { VisualTheme } from './VisualTheme';

const materials = [
  'desktop-background',
  'desktop-panel',
  'desktop-tray',
  'board',
  'panel',
  'tray',
  'well',
  'logo',
  'button-primary',
  'button-secondary',
];
const batches = new WeakMap<Phaser.Textures.TextureManager, Map<VisualTheme, Promise<void>>>();

/** Register a complete skin together; failed batches leave the working skin intact. */
export function loadDesktopTheme(scene: Phaser.Scene, theme: VisualTheme): Promise<void> {
  const textures = scene.textures;
  let cache = batches.get(textures);
  if (!cache) {
    cache = new Map();
    batches.set(textures, cache);
  }
  const existing = cache.get(theme);
  if (existing) return existing;
  const entries = [
    ...materials.map((asset) => ({
      key: `skin_${theme}_${asset}`,
      url: `assets/themes/${theme}/${asset}.webp`,
    })),
    ...ANIMALS.flatMap((animal) =>
      FOODS.map((food) => ({
        key: `skin_${theme}_piece_${animal}_${food}`,
        url: `assets/themes/${theme}/pieces/${animal}_${food}.webp`,
      })),
    ),
  ];
  const batch = Promise.all(
    entries.map(async (entry) => {
      if (textures.exists(entry.key)) return undefined;
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Unable to load ${entry.url}`));
        image.src = entry.url;
      });
      return { key: entry.key, image };
    }),
  )
    .then(async (loaded) => {
      await document.fonts.load('700 24px "Bentoku Nunito"').catch(() => {});
      for (const entry of loaded)
        if (entry && !textures.exists(entry.key)) textures.addImage(entry.key, entry.image);
    })
    .catch((error) => {
      cache.delete(theme);
      throw error;
    });
  cache.set(theme, batch);
  return batch;
}
