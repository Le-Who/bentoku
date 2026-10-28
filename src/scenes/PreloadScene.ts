import Phaser from 'phaser';
import { loadDesktopTheme } from '../game/DesktopThemeLoader';
import { DEFAULT_VISUAL_THEME, VISUAL_THEMES } from '../game/VisualTheme';
import { SaveService } from '../services/SaveService';
import { COLORS, FONT_DISPLAY } from '../game/constants';
import { sharedImageAssets, musicAssets, soundAssets } from '../services/AssetRegistry';

export class PreloadScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const title = this.add
      .text(800, 380, 'Packing your bento…', {
        fontFamily: FONT_DISPLAY,
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#6e5047',
      })
      .setOrigin(0.5);
    this.status = title;
    const track = this.add.graphics();
    track.fillStyle(COLORS.milk, 0.7);
    track.fillRoundedRect(600, 438, 400, 18, 9);
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(COLORS.coral, 0.92);
      bar.fillRoundedRect(604, 442, 392 * value, 10, 5);
    });
    this.load.on('complete', () => {
      title.setText('Ready!');
    });

    sharedImageAssets.forEach(({ key, path }) => this.load.image(key, path));
    Object.values(soundAssets).forEach(({ key, path }) => this.load.audio(key, path));
    const firstMusic = musicAssets[0];
    if (firstMusic) this.load.audio(firstMusic.key, firstMusic.path);
  }

  create(): void {
    void this.startPuzzle();
  }

  private async startPuzzle(): Promise<void> {
    const mobile =
      new URLSearchParams(location.search).get('layout') === 'mobile' ||
      window.matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1100px)').matches;
    if (!mobile) {
      this.status?.setText('Preparing your table…');
      const save = new SaveService();
      const preferred = save.settings.visualTheme;
      const choices = [
        preferred,
        DEFAULT_VISUAL_THEME,
        ...VISUAL_THEMES.map((theme) => theme.id),
      ].filter((theme, index, all) => all.indexOf(theme) === index);
      for (const theme of choices) {
        try {
          await loadDesktopTheme(this, theme);
          if (!this.sys.isActive()) return;
          if (theme !== preferred) save.updateSettings({ visualTheme: theme });
          this.scene.start('PuzzleScene', { desktopTheme: theme });
          return;
        } catch {
          /* Fall back to another complete material set. */
        }
      }
    }
    // Mobile starts synchronously during create(), before Phaser marks this scene active.
    if (mobile || this.sys.isActive()) this.scene.start('PuzzleScene');
  }
}
