import Phaser from 'phaser';
import { createGameConfig } from './game/config';
import { connectHubBridge } from './platform/HubBridge';
import type { PuzzleScene } from './scenes/PuzzleScene';
import './styles.css';

// Mobile now has its own presentation; never show the old rotation gate while assets load.
document.getElementById('rotate-device')?.remove();

const game = new Phaser.Game(createGameConfig());
game.canvas.setAttribute('tabindex', '0');
game.canvas.setAttribute('aria-label', 'Bentoku cozy bento deduction puzzle');
game.canvas.addEventListener('pointerdown', () => game.canvas.focus());

declare global {
  interface Window {
    __BENTOKU_GAME__: Phaser.Game;
  }
}

window.__BENTOKU_GAME__ = game;

let hubVisible = true;
let pausedByHub = false;
let savedMute = false;
let savedInput = true;
let savedKeyboard = true;
let hubPausedSounds: Phaser.Sound.BaseSound[] = [];
const syncHubVisibility = (): void => {
  if (!game.isBooted || hubVisible === !pausedByHub) return;
  if (hubVisible) {
    game.input.enabled = savedInput;
    if (game.input.keyboard) game.input.keyboard.enabled = savedKeyboard;
    game.sound.setMute(savedMute);
    hubPausedSounds.forEach((sound) => {
      if (sound.isPaused) sound.resume();
    });
    hubPausedSounds = [];
    game.resume();
  } else {
    const puzzle = game.scene.getScene('PuzzleScene') as PuzzleScene | null;
    if (puzzle?.scene.isActive()) puzzle.suspendForHub();
    savedInput = game.input.enabled;
    savedKeyboard = game.input.keyboard?.enabled ?? true;
    game.input.enabled = false;
    if (game.input.keyboard) game.input.keyboard.enabled = false;
    savedMute = game.sound.mute;
    game.sound.setMute(true);
    hubPausedSounds = game.sound.getAllPlaying();
    hubPausedSounds.forEach((sound) => sound.pause());
    game.pause();
  }
  pausedByHub = !hubVisible;
};
game.events.once(Phaser.Core.Events.READY, syncHubVisibility);
const disconnectHub = connectHubBridge((visible) => {
  hubVisible = visible;
  document.documentElement.dataset.hubEmbedded = 'true';
  document.body.inert = !visible;
  document.documentElement.dataset.hubPaused = String(!visible);
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.inert = !visible;
  });
  syncHubVisibility();
});
game.events.once(Phaser.Core.Events.DESTROY, disconnectHub);
