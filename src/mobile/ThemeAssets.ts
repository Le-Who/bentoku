import { ANIMALS, FOODS, type PieceId } from '../puzzle/types';
import type { VisualTheme } from '../game/VisualTheme';

const pending = new Map<VisualTheme, Promise<void>>();
const materials = [
  'background',
  'board',
  'panel',
  'tray',
  'button-primary',
  'button-secondary',
  'logo',
  'well',
];

export const themePieceUrl = (theme: VisualTheme, piece: PieceId): string =>
  `assets/themes/${theme}/pieces/${piece}.webp`;

/** Switch complete material sets together instead of showing a half-loaded theme. */
export function loadThemeAssets(theme: VisualTheme): Promise<void> {
  const existing = pending.get(theme);
  if (existing) return existing;
  const urls = [
    ...materials.map((name) => `assets/themes/${theme}/${name}.webp`),
    ...ANIMALS.flatMap((animal) => FOODS.map((food) => themePieceUrl(theme, `${animal}_${food}`))),
  ];
  const loading = Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Unable to load ${url}`));
          image.src = url;
        }),
    ),
  )
    .then(() => undefined)
    .catch((error) => {
      pending.delete(theme);
      throw error;
    });
  pending.set(theme, loading);
  return loading;
}
