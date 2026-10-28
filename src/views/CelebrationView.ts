import Phaser from 'phaser';
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../game/constants';
import type { VisualTheme } from '../game/VisualTheme';
import { addThemedMaterial, desktopMaterial, desktopSkin } from '../game/DesktopTheme';

export class CelebrationView extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, onNext: () => void, onCopy: () => void, theme?: VisualTheme) {
    super(scene, 800, 450);
    scene.add.existing(this);
    this.setDepth(3000);

    const shade = scene.add.rectangle(0, 0, 1600, 900, COLORS.walnut, 0.22).setInteractive();
    const card = scene.add.graphics();
    card.fillStyle(COLORS.shadow, 0.16);
    card.fillRoundedRect(-242, -186, 500, 390, 38);
    card.fillStyle(COLORS.milk, 1);
    card.fillRoundedRect(-250, -198, 500, 390, 38);
    card.lineStyle(4, COLORS.blush, 0.5);
    card.strokeRoundedRect(-242, -190, 484, 374, 32);
    this.add([shade, card]);
    const skin = theme ? desktopSkin(theme) : undefined;
    if (theme) {
      card.setVisible(false);
      this.add(desktopMaterial(scene, theme, 'panel', 500, 390));
    }

    const stamp = scene.add.image(0, -90, 'success_stamp').setDisplaySize(132, 132).setAngle(-7);
    const title = scene.add
      .text(0, -6, 'Bento complete!', {
        fontFamily: skin?.font ?? FONT_DISPLAY,
        fontSize: '34px',
        fontStyle: 'bold',
        color: skin?.inkCss ?? '#6c4941',
      })
      .setOrigin(0.5);
    const body = scene.add
      .text(0, 40, 'A tiny tray of very happy friends.', {
        fontFamily: skin?.font ?? FONT_BODY,
        fontSize: '19px',
        color: skin?.mutedCss ?? '#80675f',
      })
      .setOrigin(0.5);
    this.add([stamp, title, body]);

    this.add(this.button(scene, -100, 116, 'Copy seed', onCopy, false, theme));
    this.add(this.button(scene, 100, 116, 'Another bento', onNext, true, theme));
    this.setAlpha(0).setScale(0.92);
    scene.tweens.add({ targets: this, alpha: 1, scale: 1, duration: 360, ease: 'Back.easeOut' });
  }

  private button(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    callback: () => void,
    primary: boolean,
    theme?: VisualTheme,
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);
    const background = scene.add.graphics();
    background.fillStyle(primary ? COLORS.coral : COLORS.mint, 1);
    background.fillRoundedRect(-88, -25, 176, 50, 22);
    if (theme) {
      background.setVisible(false);
      container.add(
        addThemedMaterial(
          scene,
          theme,
          primary ? 'button-primary' : 'button-secondary',
          0,
          0,
          176,
          50,
        ),
      );
    }
    const text = scene.add
      .text(0, 0, label, {
        fontFamily: theme ? desktopSkin(theme).font : FONT_BODY,
        fontSize: '17px',
        fontStyle: 'bold',
        color: theme
          ? theme === 'maple' && primary
            ? '#fffaf2'
            : desktopSkin(theme).inkCss
          : primary
            ? '#fffaf2'
            : '#52604f',
      })
      .setOrigin(0.5);
    container.add([background, text]);
    container.setSize(176, 50).setInteractive({ useHandCursor: true });
    container.on('pointerdown', callback);
    container.on('pointerover', () => container.setScale(1.04));
    container.on('pointerout', () => container.setScale(1));
    return container;
  }
}
