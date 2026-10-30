import { ANIMALS, FOODS, type Board, type PieceId, type PuzzleDefinition } from '../puzzle/types';
import { ANIMAL_LABELS, FOOD_LABELS } from '../game/constants';
import { DEFAULT_VISUAL_THEME, VISUAL_THEMES, type VisualTheme } from '../game/VisualTheme';
import { applyThemePieceArt, loadThemeAssets, themeBoardCenters } from './ThemeAssets';
import { clueDiagram } from './ClueDiagram';
import {
  button,
  element,
  MobileDialog,
  type MobileAction,
  type MobileSlider,
} from './MobileDialog';
import './mobile.css';
import './theme-skins.css';
import './theme-button-centers.css';

export interface MobileState {
  puzzle: PuzzleDefinition;
  board: Board;
  selected: PieceId | null;
  canUndo: boolean;
  solved: boolean;
  reducedMotion: boolean;
  theme: VisualTheme;
}

interface MobileActions {
  select: (piece: PieceId) => void;
  activate: (cell: number) => void;
  drop: (piece: PieceId, cell: number | null) => void;
  undo: () => void;
  help: () => void;
  settings: () => void;
  difficulty: () => void;
  daily: () => void;
  next: () => void;
  startMusic: () => void;
  closeModal: () => void;
  presentationChanged: (active: boolean) => void;
  changeTheme: (theme: VisualTheme) => void;
  themeSelectionStarted: () => void;
}

interface Press {
  id: PieceId;
  pointer: number;
  x: number;
  y: number;
  source: HTMLButtonElement;
  ghost?: HTMLElement;
}

const icons: Record<string, string> = {
  settings:
    '<path d="m9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v2l1 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1-2v-2l-1-2 2-3 2 .2Z"/><circle cx="12" cy="10" r="3"/>',
  undo: '<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 0 14" transform="translate(0 -3)"/>',
  hint: '<path d="M9 17h6m-6 3h6M8 14a7 7 0 1 1 8 0l-1 3H9Z"/>',
  daily:
    '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 2v6m8-6v6M4 11h16m-12 4h2m4 0h2"/>',
};

// Preserve the 24-unit scale while centering each drawing's painted bounds.
const iconViewBoxes: Record<string, string> = {
  settings: '0 -2.2 24 24',
  undo: '-0.5 -0.5 24 24',
  hint: '0 -1.3723 24 24',
  daily: '0 -0.5 24 24',
};

function iconButton(label: string, name: string, action: () => void): HTMLButtonElement {
  const node = button('', 'mobile-icon-button', action);
  node.setAttribute('aria-label', label);
  node.title = label;
  node.firstElementChild!.innerHTML = `<svg viewBox="${iconViewBoxes[name]}" aria-hidden="true">${icons[name]}</svg>`;
  return node;
}

/** Mobile presentation only; all puzzle mutations are owned by PuzzleScene. */
export class MobileGameView {
  readonly root = element('section', 'mobile-shell');
  readonly dialog = new MobileDialog();
  active = false;
  private state?: MobileState;
  private renderedPuzzle?: PuzzleDefinition;
  private appliedTheme?: VisualTheme;
  private requestedTheme?: VisualTheme;
  private destroyed = false;
  private themeSelection = 0;
  private pendingTheme?: VisualTheme;
  private failedTheme?: VisualTheme;
  private themeErrorDismissed = false;
  private themeLoad = 0;
  private loading = element('div', 'mobile-theme-loading', 'Packing your bento…');
  private notes = element('section', 'mobile-notes');
  private board = element('div', 'mobile-board');
  private tray = element('div', 'mobile-tray');
  private level: HTMLButtonElement;
  private undoButton: HTMLButtonElement;
  private helpButton: HTMLButtonElement;
  private cells: HTMLElement[] = [];
  private pockets = new Map<PieceId, HTMLElement>();
  private pieces = new Map<PieceId, HTMLButtonElement>();
  private press?: Press;
  private suppressClick = false;
  private media = matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1100px)');
  private onResize = (): void => {
    this.cancelDrag();
    this.resize();
  };

  constructor(private actions: MobileActions) {
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Mobile Bentoku');
    const header = element('header', 'mobile-header');
    const title = element('h1', 'mobile-wordmark', 'Bentoku');
    const daily = iconButton('Daily bento', 'daily', actions.daily);
    this.level = button('Gentle', 'mobile-level', actions.difficulty);
    this.level.setAttribute('aria-label', 'Choose difficulty');
    header.append(title, daily, this.level, iconButton('Settings', 'settings', actions.settings));
    this.notes.setAttribute('aria-label', 'Order notes');
    const boardWrap = element('div', 'mobile-board-wrap');
    this.board.setAttribute('role', 'group');
    this.board.setAttribute('aria-label', 'Bento board');
    for (let index = 0; index < 9; index++) {
      const cell = element('div', 'mobile-cell');
      cell.dataset.cell = String(index);
      const target = button('', 'mobile-cell-target');
      target.setAttribute('aria-label', `Bento cell ${index + 1}`);
      cell.append(target);
      this.cells.push(cell);
      this.board.append(cell);
    }
    boardWrap.append(this.board);
    this.tray.setAttribute('aria-label', 'Bento friends. Choose three complete families.');
    const toolbar = element('footer', 'mobile-toolbar');
    this.undoButton = button('Undo', 'mobile-control mobile-undo', actions.undo);
    this.undoButton.firstElementChild!.prepend(
      iconButton('Undo icon', 'undo', () => {}).querySelector('svg')!,
    );
    const help = button('Hint', 'mobile-control is-primary', () =>
      this.state?.solved ? actions.next() : actions.help(),
    );
    this.helpButton = help;
    help.firstElementChild!.prepend(
      iconButton('Hint icon', 'hint', () => {}).querySelector('svg')!,
    );
    toolbar.append(this.undoButton, help);
    this.root.append(header, this.notes, boardWrap, this.tray, toolbar);
    document.getElementById('app')!.append(this.root);
    this.loading.setAttribute('role', 'status');
    this.loading.hidden = true;
    document.getElementById('app')!.append(this.loading);
    this.root.addEventListener('click', (event) => this.click(event));
    this.root.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.root.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.root.addEventListener('pointerup', (event) => this.pointerUp(event));
    this.root.addEventListener('pointercancel', () => this.cancelDrag());
    this.root.addEventListener('lostpointercapture', (event) => {
      if (this.press?.pointer === event.pointerId) this.cancelDrag();
    });
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.media.addEventListener('change', this.onResize);
    this.resize();
  }

  update(state: MobileState): void {
    this.state = state;
    if (!this.active) return;
    this.prepareTheme(state.theme);
    const newPuzzle = this.renderedPuzzle !== state.puzzle;
    this.renderedPuzzle = state.puzzle;
    this.level.firstElementChild!.textContent = `${state.puzzle.difficulty} ⌄`;
    this.root.classList.toggle('reduced-motion', state.reducedMotion);
    this.undoButton.disabled = !state.canUndo || state.solved;
    const helpLabel = state.solved ? 'Next bento' : 'Hint';
    const helpText = this.helpButton.firstElementChild!.lastChild;
    if (helpText?.nodeType === Node.TEXT_NODE) helpText.textContent = helpLabel;
    if (newPuzzle) {
      this.cancelDrag();
      this.root
        .querySelectorAll('[data-cell] [data-piece-id], .mobile-hint-ghost')
        .forEach((node) => node.remove());
      this.renderNotes();
      this.pieces.clear();
      this.pockets.clear();
      this.tray.replaceChildren();
      for (const piece of state.puzzle.pieces) {
        const pocket = element('div', 'mobile-pocket');
        pocket.dataset.pocket = piece.id;
        const family = ANIMALS.indexOf(piece.animal);
        const food = FOODS.indexOf(piece.food);
        pocket.style.setProperty('--family-column', String(family + 1));
        pocket.style.setProperty('--food-row', String(food + 1));
        pocket.style.order = String(family * FOODS.length + food);
        const target = button('', 'mobile-pocket-target');
        target.setAttribute(
          'aria-label',
          `Return ${ANIMAL_LABELS[piece.animal]} ${FOOD_LABELS[piece.food]} to tray`,
        );
        pocket.append(target);
        this.pockets.set(piece.id, pocket);
        this.tray.append(pocket);
        const node = button('', 'mobile-piece');
        node.dataset.pieceId = piece.id;
        node.setAttribute(
          'aria-label',
          `${ANIMAL_LABELS[piece.animal]} ${FOOD_LABELS[piece.food]}`,
        );
        const art = element('img', 'mobile-piece-art');
        if (this.appliedTheme) applyThemePieceArt(art, this.appliedTheme, piece.id);
        art.alt = '';
        art.draggable = false;
        node.append(art);
        this.pieces.set(piece.id, node);
      }
    }
    for (const [id, node] of this.pieces) {
      const cell = state.board.indexOf(id);
      const parent = cell >= 0 ? this.cells[cell]! : this.pockets.get(id)!;
      if (node.parentElement !== parent) parent.append(node);
      node.classList.toggle('is-selected', state.selected === id);
      node.setAttribute('aria-pressed', String(state.selected === id));
      node.disabled = state.solved;
      this.pockets.get(id)!.classList.toggle('is-empty', cell >= 0);
    }
    this.resize();
  }

  private renderNotes(): void {
    const clues = this.state!.puzzle.clues;
    const overview = element('div', 'mobile-clue-overview');
    const spatial = element('div', 'mobile-spatial-clues');
    const rest = clues.filter((clue) => clue.id !== 'anchor-map').length;
    spatial.style.setProperty(
      '--clue-columns',
      String(rest <= 2 ? Math.max(1, rest) : rest <= 4 ? 2 : 3),
    );
    clues.forEach((clue, index) => {
      const card = button('', 'mobile-clue-card', () => this.openClue(index));
      card.dataset.clueId = clue.id;
      card.setAttribute(
        'aria-label',
        `Enlarge ${clue.id === 'anchor-map' ? 'café map' : `clue ${index + 1}`}`,
      );
      card.append(clueDiagram(clue));
      if (clue.id === 'anchor-map') {
        card.classList.add('is-map');
        overview.append(card);
      } else spatial.append(card);
    });
    overview.classList.toggle('only-map', rest === 0);
    overview.append(spatial);
    this.notes.replaceChildren(overview);
  }

  private openClue(index: number): void {
    const clues = this.state!.puzzle.clues;
    const clue = clues[index]!;
    const content = this.dialog.show(
      clue.id === 'anchor-map' ? 'Café map' : `Order note ${index + 1}`,
      clue.id === 'anchor-map'
        ? 'The café map stays in place. Blank cells are unknown.'
        : 'This sketch can slide. Keep the same shape and spacing.',
      [
        {
          label: 'Previous',
          callback: () => this.openClue((index + clues.length - 1) % clues.length),
        },
        { label: 'Next', callback: () => this.openClue((index + 1) % clues.length) },
      ],
      () => this.dialog.close(),
    );
    const diagram = element('div', 'mobile-enlarged-clue');
    diagram.append(clueDiagram(clue));
    content.insertBefore(diagram, content.querySelector('.mobile-dialog-actions'));
    const count = element('p', 'mobile-note-position', `${index + 1} of ${clues.length}`);
    diagram.after(count);
  }

  showDialog(
    title: string,
    body: string,
    actions: readonly MobileAction[],
    sliders?: readonly MobileSlider[],
  ): void {
    this.dialog.show(title, body, actions, this.actions.closeModal, sliders);
  }

  showThemePicker(current: VisualTheme): void {
    this.dialog.addThemePicker(this.pendingTheme ?? current, (theme) => {
      this.actions.themeSelectionStarted();
      const selection = ++this.themeSelection;
      this.pendingTheme = theme;
      this.dialog.themeStatus('Loading this look…');
      void loadThemeAssets(theme)
        .then(() => {
          if (this.destroyed || this.themeSelection !== selection) return;
          this.pendingTheme = undefined;
          this.failedTheme = undefined;
          this.actions.changeTheme(theme);
          this.dialog.themeStatus('', theme);
        })
        .catch(() => {
          if (this.destroyed || this.themeSelection !== selection) return;
          this.pendingTheme = undefined;
          this.dialog.themeStatus(
            'This look could not load. Choose it again to retry.',
            this.state?.theme ?? current,
          );
        });
    });
    if (this.pendingTheme) this.dialog.themeStatus('Loading this look…');
  }

  cancelPendingThemeSelection(): void {
    ++this.themeSelection;
    this.pendingTheme = undefined;
    // A fallback from the first mobile load must not replace a later desktop choice.
    // Clearing the request also allows that first mobile skin to retry on return.
    if (!this.appliedTheme || this.failedTheme) {
      ++this.themeLoad;
      this.requestedTheme = undefined;
      this.failedTheme = undefined;
    }
    if (this.state) this.dialog.themeStatus('', this.state.theme);
  }

  private prepareTheme(theme: VisualTheme): void {
    if (this.requestedTheme === theme || this.failedTheme === theme) return;
    this.cancelDrag();
    this.requestedTheme = theme;
    this.failedTheme = undefined;
    this.themeErrorDismissed = false;
    this.loading.classList.remove('is-retry-banner');
    this.loading.textContent = 'Packing your bento…';
    const load = ++this.themeLoad;
    this.loading.hidden = Boolean(this.appliedTheme) || !this.active;
    this.root.classList.toggle('is-loading-theme', !this.appliedTheme);
    void loadThemeAssets(theme)
      .then(() => {
        if (this.destroyed || this.themeLoad !== load || this.state?.theme !== theme) return;
        this.appliedTheme = theme;
        this.root.dataset.theme = theme;
        this.dialog.node.dataset.theme = theme;
        const centers = themeBoardCenters[theme];
        this.cells.forEach((cell, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          cell.style.setProperty(
            '--piece-x',
            `${50 + (centers.columns[column]! - (20 + column * 30)) / 0.28}%`,
          );
          cell.style.setProperty(
            '--piece-y',
            `${50 + (centers.rows[row]! - (20 + row * 30)) / 0.28}%`,
          );
        });
        for (const [id, node] of this.pieces) {
          applyThemePieceArt(node.querySelector<HTMLImageElement>('img')!, theme, id);
        }
        this.root.querySelectorAll<HTMLElement>('[data-hint-piece]').forEach((node) => {
          applyThemePieceArt(
            node.querySelector<HTMLImageElement>('img')!,
            theme,
            node.dataset.hintPiece as PieceId,
          );
        });
        this.loading.hidden = true;
        this.root.classList.remove('is-loading-theme');
      })
      .catch(() => {
        if (this.destroyed || this.themeLoad !== load || this.requestedTheme !== theme) return;
        if (!this.appliedTheme) void this.fallbackTheme(theme, load);
        else {
          this.requestedTheme = undefined;
          this.failedTheme = theme;
          const retry = button('Try again', 'mobile-control', () => {
            this.failedTheme = undefined;
            this.prepareTheme(this.state!.theme);
          });
          const dismiss = button('×', 'mobile-theme-dismiss', () => {
            this.themeErrorDismissed = true;
            this.loading.hidden = true;
          });
          dismiss.setAttribute('aria-label', 'Dismiss artwork message');
          this.loading.replaceChildren(
            element('p', '', 'This look could not load. Your bento is safe.'),
            retry,
            dismiss,
          );
          this.loading.classList.add('is-retry-banner');
          this.loading.hidden = !this.active;
        }
      });
  }

  private async fallbackTheme(failed: VisualTheme, load: number): Promise<void> {
    const choices = [DEFAULT_VISUAL_THEME, ...VISUAL_THEMES.map((theme) => theme.id)].filter(
      (theme, index, all) => theme !== failed && all.indexOf(theme) === index,
    );
    for (const theme of choices) {
      try {
        await loadThemeAssets(theme);
        if (
          this.destroyed ||
          this.themeLoad !== load ||
          this.appliedTheme ||
          this.state?.theme !== failed
        )
          return;
        this.actions.changeTheme(theme);
        return;
      } catch {
        /* Try the next complete material set, never a partial skin. */
      }
    }
    if (
      this.destroyed ||
      this.themeLoad !== load ||
      this.appliedTheme ||
      this.state?.theme !== failed
    )
      return;
    const retry = button('Try again', 'mobile-control', () => {
      this.loading.textContent = 'Packing your bento…';
      this.requestedTheme = undefined;
      this.prepareTheme(failed);
    });
    this.loading.replaceChildren(
      element('p', '', 'The artwork could not load. Check your connection and try again.'),
      retry,
    );
  }

  showHint(piece: PieceId, cell: number): void {
    this.root.querySelector('.mobile-hint-ghost')?.remove();
    const ghost = this.pieces.get(piece)!.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-piece-id');
    ghost.dataset.hintPiece = piece;
    ghost.className = 'mobile-piece mobile-hint-ghost';
    ghost.setAttribute('aria-label', 'Hint preview');
    this.cells[cell]!.append(ghost);
    window.setTimeout(() => ghost.remove(), 4000);
  }

  private resize(): void {
    const forced = new URLSearchParams(location.search).get('layout') === 'mobile';
    const active = this.media.matches || forced;
    this.root.classList.toggle('is-preview', forced && !this.media.matches);
    const changed = active !== this.active;
    if (changed) {
      this.cancelDrag();
      this.dialog.close();
    }
    this.active = active;
    this.root.hidden = !active;
    this.loading.hidden =
      !active || (Boolean(this.appliedTheme) && (!this.failedTheme || this.themeErrorDismissed));
    document.documentElement.classList.toggle('mobile-layout', active);
    document.getElementById('game')?.setAttribute('aria-hidden', String(active));
    if (changed) this.actions.presentationChanged(active);
    if (!active) return;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const width = window.visualViewport?.width ?? window.innerWidth;
    const preview = forced && !this.media.matches;
    const landscape = !preview && height <= 520 && Math.min(width, 1100) > height;
    const hubCompact =
      !landscape && height <= 560 && document.documentElement.dataset.hubEmbedded === 'true';
    this.root.classList.toggle('is-landscape', landscape);
    this.root.classList.toggle('is-short-landscape', landscape && height <= 360);
    this.root.classList.toggle('is-compact', !landscape && height <= 620);
    this.root.classList.toggle('is-hub-compact', hubCompact);
    this.root.style.setProperty('--mobile-height', `${height}px`);
    const count = this.state?.puzzle.clues.length ?? 7;
    const notesHeight = Math.max(
      hubCompact ? 112 : 128,
      Math.min(count > 5 ? 190 : 152, height * (count > 5 ? 0.24 : 0.2) - 10),
    );
    this.root.style.setProperty('--notes-height', `${notesHeight}px`);
    // Give the twelve friends more room, while retaining a usable board on
    // short phones and respecting the device's actual safe-area padding.
    const style = getComputedStyle(this.root);
    const boardAndTrayHeight =
      height -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom) -
      this.root.querySelector<HTMLElement>('.mobile-header')!.getBoundingClientRect().height -
      this.undoButton.parentElement!.getBoundingClientRect().height -
      notesHeight -
      parseFloat(style.rowGap) * 4;
    this.root.style.setProperty(
      '--tray-height',
      `${Math.max(hubCompact ? 132 : 148, Math.min(360, height * 0.32, boardAndTrayHeight - (hubCompact ? 140 : 160)))}px`,
    );
    if (changed && this.state) this.update(this.state);
  }

  private click(event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      return;
    }
    if (!this.state || this.state.solved || this.dialog.node.open) return;
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>('[data-cell]');
    const piece = target.closest<HTMLElement>('[data-piece-id]');
    const pocket = target.closest<HTMLElement>('[data-pocket]');
    if (cell) this.actions.activate(Number(cell.dataset.cell));
    else if (piece) this.actions.select(piece.dataset.pieceId as PieceId);
    else if (pocket && this.state.selected) this.actions.drop(this.state.selected, null);
  }

  private pointerDown(event: PointerEvent): void {
    this.actions.startMusic();
    if (!event.isPrimary || event.button !== 0 || this.state?.solved || this.dialog.node.open)
      return;
    const source = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-piece-id]');
    if (!source) return;
    this.press = {
      id: source.dataset.pieceId as PieceId,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      source,
    };
    source.setPointerCapture(event.pointerId);
  }

  private pointerMove(event: PointerEvent): void {
    const press = this.press;
    if (!press || press.pointer !== event.pointerId) return;
    if (!press.ghost && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 9) return;
    if (!press.ghost) {
      const ghost = press.source.cloneNode(true) as HTMLElement;
      ghost.className = 'mobile-drag-ghost';
      ghost.removeAttribute('data-piece-id');
      ghost.setAttribute('aria-hidden', 'true');
      const bounds = press.source.getBoundingClientRect();
      // A lifted friend stays legible even when its source is a compact pocket.
      const size = Math.max(76, Math.min(112, Math.max(bounds.width, bounds.height)));
      ghost.style.width = `${size}px`;
      ghost.style.height = `${size}px`;
      document.body.append(ghost);
      press.ghost = ghost;
      press.source.classList.add('is-dragging');
    }
    press.ghost.style.left = `${event.clientX}px`;
    const lift = event.pointerType === 'touch' ? Math.max(48, press.ghost.offsetHeight * 0.7) : 8;
    press.ghost.style.top = `${event.clientY - lift}px`;
    this.root.querySelector('.is-drop-target')?.classList.remove('is-drop-target');
    document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-cell]')
      ?.classList.add('is-drop-target');
    event.preventDefault();
  }

  private pointerUp(event: PointerEvent): void {
    const press = this.press;
    if (!press || press.pointer !== event.pointerId) return;
    const dragged = Boolean(press.ghost);
    if (dragged) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target?.closest<HTMLElement>('[data-cell]');
      if (cell) this.actions.drop(press.id, Number(cell.dataset.cell));
      else if (target?.closest('[data-pocket]')) this.actions.drop(press.id, null);
    }
    this.cancelDrag();
    this.suppressClick = dragged;
    if (dragged)
      window.setTimeout(() => {
        this.suppressClick = false;
      }, 0);
  }

  cancelInteraction(): void {
    this.cancelDrag();
  }

  private cancelDrag(): void {
    const press = this.press;
    this.press = undefined;
    if (press?.source.hasPointerCapture(press.pointer))
      press.source.releasePointerCapture(press.pointer);
    press?.ghost?.remove();
    press?.source.classList.remove('is-dragging');
    this.root.querySelector('.is-drop-target')?.classList.remove('is-drop-target');
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelDrag();
    this.dialog.destroy();
    this.root.remove();
    this.loading.remove();
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.media.removeEventListener('change', this.onResize);
    document.documentElement.classList.remove('mobile-layout');
  }
}
