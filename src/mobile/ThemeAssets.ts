import { ANIMALS, FOODS, type PieceId } from '../puzzle/types';
import type { VisualTheme } from '../game/VisualTheme';
import { themePieceCenters } from './theme-piece-centers';

const pending = new Map<VisualTheme, Promise<void>>();

// Painted compartment midpoints in the source boards. Bevels are slightly
// uneven; these optical adjustments move art, while touch cells stay uniform.
export const themeBoardCenters = {
  picnic: { columns: [19.4, 49.9, 80.5], rows: [19.3, 49.6, 80.5] },
  porcelain: { columns: [19.4, 50.1, 80.5], rows: [19.2, 49.4, 79.8] },
  maple: { columns: [20.1, 50.2, 80.3], rows: [19.5, 49.1, 78.9] },
} as const;
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

export function applyThemePieceArt(
  image: HTMLImageElement,
  theme: VisualTheme,
  piece: PieceId,
): void {
  const [x, y] = themePieceCenters[theme][piece];
  image.src = themePieceUrl(theme, piece);
  image.style.transform = `translate(-${x}%, -${y}%)`;
}

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
