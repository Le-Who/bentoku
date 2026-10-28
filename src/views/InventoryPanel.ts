import Phaser from 'phaser';
import { FONT_DISPLAY } from '../game/constants';
import type { VisualTheme } from '../game/VisualTheme';
import { desktopPortraitMaterial, desktopSkin, themeTexture } from '../game/DesktopTheme';

export class InventoryPanel extends Phaser.GameObjects.Container {
  readonly width = 455;
  readonly height = 650;
  private readonly theme?: VisualTheme;
  private readonly background: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, theme?: VisualTheme) {
    super(scene, x, y);
    this.theme = theme;
    scene.add.existing(this);
    this.background = scene.add.graphics();
    this.add(this.background);
    this.draw();
    if (theme) {
      this.add(desktopPortraitMaterial(scene, theme, 'tray', 418, 680));
      const wellCenter = {
        picnic: [0.475, 0.475],
        porcelain: [0.45, 0.45],
        maple: [0.47, 0.46],
      }[theme]!;
      for (let i = 0; i < 12; i += 1) {
        const pos = this.trayPosition(i);
        this.add(
          scene.add
            .image(
              pos.x - x + (0.5 - wellCenter[0]!) * 118,
              pos.y - y + (0.5 - wellCenter[1]!) * 118,
              themeTexture(theme, 'well'),
            )
            .setDisplaySize(118, 118),
        );
      }
    }
    const skin = theme ? desktopSkin(theme) : undefined;
    const title = scene.add
      .text(0, theme ? -298 : -363, 'BENTO FRIENDS', {
        fontFamily: skin?.font ?? FONT_DISPLAY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: skin?.inkCss ?? '#704f47',
        letterSpacing: 2,
        stroke: skin?.paperCss ?? '#f5e5d3',
        strokeThickness: 1,
      })
      .setOrigin(0.5);
    const sub = scene.add
      .text(0, theme ? -268 : -334, '3 complete families · 1 stays', {
        fontFamily: skin?.font ?? 'Trebuchet MS, sans-serif',
        fontSize: '14px',
        color: skin?.inkCss ?? '#74584f',
        stroke: skin?.paperCss ?? '#f5e5d3',
        strokeThickness: 1,
      })
      .setOrigin(0.5);
    this.add([title, sub]);
  }

  private draw(): void {
    this.background.setVisible(false);
  }

  trayPosition(index: number): Phaser.Math.Vector2 {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const rowOffsets = this.theme ? [-190, -54, 82, 218] : [-224, -78, 62, 192];
    return new Phaser.Math.Vector2(
      this.x + (this.theme ? -122 : -126) + column * (this.theme ? 122 : 121),
      this.y + rowOffsets[row]!,
    );
  }

  containsWorldPoint(x: number, y: number): boolean {
    return (
      x >= this.x - this.width / 2 &&
      x <= this.x + this.width / 2 &&
      y >= this.y - this.height / 2 &&
      y <= this.y + this.height / 2
    );
  }
}
