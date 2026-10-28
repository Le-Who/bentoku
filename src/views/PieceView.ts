import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import type { BentoPiece } from '../puzzle/types';
import type { VisualTheme } from '../game/VisualTheme';
import { desktopSkin, getThemedPieceVisualLayout, themeTexture } from '../game/DesktopTheme';

export class PieceView extends Phaser.GameObjects.Container {
  readonly piece: BentoPiece;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly theme?: VisualTheme;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly ring: Phaser.GameObjects.Graphics;
  home = new Phaser.Math.Vector2();
  boardCell: number | null = null;

  constructor(scene: Phaser.Scene, piece: BentoPiece, x: number, y: number, theme?: VisualTheme) {
    super(scene, x, y);
    this.piece = piece;
    this.theme = theme;
    const artworkReady = Boolean(theme);
    this.shadow = scene.add.ellipse(3, 35, 84, 28, COLORS.shadow, 0.18);
    // The source canvas intentionally includes generous transparent safety
    // padding. Scale and optically center the whole canvas; never trim it.
    const visual = theme
      ? getThemedPieceVisualLayout(theme, piece.id, 130)
      : { size: 130, x: 0, y: 0 };
    this.sprite = scene.add
      .image(visual.x, visual.y, theme ? themeTexture(theme, `piece_${piece.id}`) : '__WHITE')
      .setDisplaySize(visual.size, visual.size)
      .setVisible(artworkReady);
    if (theme || !artworkReady) this.shadow.setVisible(false);
    this.ring = scene.add.graphics();
    this.add([this.shadow, this.sprite, this.ring]);
    this.setSize(116, 116);
    this.setInteractive({ useHandCursor: true });
    scene.input.setDraggable(this);
    scene.add.existing(this);
  }

  setHome(x: number, y: number, boardCell: number | null): void {
    this.home.set(x, y);
    this.boardCell = boardCell;
    if (this.theme) {
      const visual = getThemedPieceVisualLayout(
        this.theme,
        this.piece.id,
        boardCell === null ? 130 : 158,
      );
      this.sprite.setPosition(visual.x, visual.y).setDisplaySize(visual.size, visual.size);
    }
  }

  setSelected(selected: boolean): void {
    this.ring.clear();
    if (!selected) return;
    this.ring.lineStyle(5, this.theme ? desktopSkin(this.theme).accent : COLORS.focus, 1);
    this.ring.strokeCircle(0, 0, 57);
    this.ring.lineStyle(2, this.theme ? desktopSkin(this.theme).paper : COLORS.milk, 0.9);
    this.ring.strokeCircle(0, 0, 62);
  }

  setFocused(focused: boolean): void {
    if (!focused) {
      this.setSelected(false);
      return;
    }
    this.ring.clear();
    this.ring.lineStyle(4, this.theme ? desktopSkin(this.theme).accent : COLORS.sage, 1);
    this.ring.strokeRoundedRect(-60, -60, 120, 120, 24);
  }

  lift(): void {
    this.shadow.setScale(1.18).setAlpha(0.26);
    this.scene.tweens.add({ targets: this, scale: 1.07, duration: 100, ease: 'Sine.easeOut' });
    this.setDepth(1000);
  }

  settle(reducedMotion: boolean): void {
    this.shadow.setScale(1).setAlpha(0.18);
    if (reducedMotion) {
      this.setScale(1);
      return;
    }
    this.scene.tweens.add({
      targets: this,
      scaleX: { from: 0.95, to: 1 },
      scaleY: { from: 0.95, to: 1 },
      duration: 170,
      ease: 'Back.easeOut',
    });
  }

  returnHome(reducedMotion: boolean): void {
    if (reducedMotion) {
      this.setPosition(this.home.x, this.home.y).setScale(1);
      return;
    }
    this.scene.tweens.add({
      targets: this,
      x: this.home.x,
      y: this.home.y,
      scale: 1,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
  }

  idle(reducedMotion: boolean): void {
    if (reducedMotion || this.scene.tweens.isTweening(this)) return;
    this.scene.tweens.add({
      targets: this,
      angle: { from: -1.5, to: 1.5 },
      scaleY: { from: 1, to: 0.975 },
      duration: 420,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }
}
