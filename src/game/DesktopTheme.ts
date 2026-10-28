import Phaser from 'phaser';
import type { PieceId } from '../puzzle/types';
import { themePieceCenters } from '../mobile/theme-piece-centers';
import type { VisualTheme } from './VisualTheme';

const skins = {
  picnic: {
    ink: 0x653d32,
    inkCss: '#653d32',
    mutedCss: '#85655a',
    paper: 0xf8e8d2,
    paperCss: '#f8e8d2',
    accent: 0xa84d54,
  },
  porcelain: {
    ink: 0x304536,
    inkCss: '#304536',
    mutedCss: '#657c6b',
    paper: 0xf6f6ee,
    paperCss: '#f6f6ee',
    accent: 0x5b8064,
  },
  maple: {
    ink: 0x593a29,
    inkCss: '#593a29',
    mutedCss: '#80694f',
    paper: 0xf2e4c5,
    paperCss: '#f2e4c5',
    accent: 0x71815c,
  },
} as const;

export const desktopSkin = (theme: VisualTheme) => ({ ...skins[theme], font: 'Bentoku Nunito' });
export const themeTexture = (theme: VisualTheme, asset: string): string => `skin_${theme}_${asset}`;

/** Center the opaque artwork instead of its transparent 512px canvas. */
export function getThemedPieceVisualLayout(theme: VisualTheme, id: PieceId, size: number) {
  const [x, y] = themePieceCenters[theme][id];
  return { size, x: (0.5 - x / 100) * size, y: (0.5 - y / 100) * size };
}

/** A nine-slice keeps the painted edges and corners intact on desktop surfaces. */
export function addThemedMaterial(
  scene: Phaser.Scene,
  theme: VisualTheme,
  asset: 'tray' | 'panel' | 'button-primary' | 'button-secondary',
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.NineSlice {
  const key = themeTexture(theme, asset);
  const frame = scene.textures.getFrame(key);
  const button = asset.startsWith('button-');
  const scale = button ? height / frame.height : 0.5;
  const edgeX = Math.round(frame.width * (button ? 0.18 : 0.14));
  const edgeY = Math.round(frame.height * (button ? 0.35 : 0.2));
  return scene.add
    .nineslice(x, y, key, undefined, width / scale, height / scale, edgeX, edgeX, edgeY, edgeY)
    .setScale(scale);
}

export function desktopMaterial(
  scene: Phaser.Scene,
  theme: VisualTheme,
  asset: 'tray' | 'panel',
  width: number,
  height: number,
): Phaser.GameObjects.NineSlice {
  return addThemedMaterial(scene, theme, asset, 0, 0, width, height);
}

/** Portrait artwork is fitted uniformly so decorations and grain keep their proportions. */
export function desktopPortraitMaterial(
  scene: Phaser.Scene,
  theme: VisualTheme,
  asset: 'tray' | 'panel',
  width: number,
  height: number,
): Phaser.GameObjects.Image {
  const image = scene.add.image(0, 0, themeTexture(theme, `desktop-${asset}`));
  return image.setScale(Math.min(width / image.width, height / image.height));
}

export function drawDesktopSurface(scene: Phaser.Scene, theme: VisualTheme): void {
  scene.add.image(800, 450, themeTexture(theme, 'desktop-background')).setDisplaySize(1600, 900);
  const logo = scene.add.image(55, 48, themeTexture(theme, 'logo')).setOrigin(0, 0.5);
  logo.setScale(Math.min(205 / logo.width, 72 / logo.height));
}
