import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { PuzzleScene } from '../scenes/PuzzleScene';

export const createGameConfig = (): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#f6e6cf',
  transparent: false,
  antialias: true,
  roundPixels: false,
  // Keep the original image URL in the browser image cache for DOM/SVG reuse.
  loader: { imageLoadType: 'HTMLImageElement' },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  input: {
    activePointers: 3,
  },
  render: {
    antialias: true,
    pixelArt: false,
    powerPreference: 'high-performance',
  },
  scene: [BootScene, PreloadScene, PuzzleScene],
});
