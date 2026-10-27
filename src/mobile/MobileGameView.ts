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

function iconButton(label: string, name: string, action: () => void): HTMLButtonElement {
  const node = button('', 'mobile-icon-button', action);
  node.setAttribute('aria-label', label);
  node.title = label;
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
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
    this.undoButton.prepend(iconButton('Undo icon', 'undo', () => {}).firstChild!);
    const help = button('Hint', 'mobile-control is-primary', () =>
      this.state?.solved ? actions.next() : actions.help(),
    );
    this.helpButton = help;
    help.prepend(iconButton('Hint icon', 'hint', () => {}).firstChild!);
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
    this.level.textContent = `${state.puzzle.difficulty} ⌄`;
    this.root.classList.toggle('reduced-motion', state.reducedMotion);
    this.undoButton.disabled = !state.canUndo || state.solved;
    const helpLabel = state.solved ? 'Next bento' : 'Hint';
    if (this.helpButton.lastChild?.nodeType === Node.TEXT_NODE)
      this.helpButton.lastChild.textContent = helpLabel;
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
        pocket.style.gridColumn = String(ANIMALS.indexOf(piece.animal) + 1);
        pocket.style.gridRow = String(FOODS.indexOf(piece.food) + 1);
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
      const selection = ++this.themeSelection;
      this.pendingTheme = theme;
      this.dialog.themeStatus('Loading this look…');
      void loadThemeAssets(theme)
        .then(() => {
          if (this.destroyed || this.themeSelection !== selection) return;
          this.pendingTheme = undefined;
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

  private prepareTheme(theme: VisualTheme): void {
    if (this.requestedTheme === theme) return;
    this.cancelDrag();
    this.requestedTheme = theme;
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
    this.loading.hidden = !active || Boolean(this.appliedTheme);
    document.documentElement.classList.toggle('mobile-layout', active);
    document.getElementById('game')?.setAttribute('aria-hidden', String(active));
    if (changed) this.actions.presentationChanged(active);
    if (!active) return;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const width = window.visualViewport?.width ?? window.innerWidth;
    const preview = forced && !this.media.matches;
    const landscape = !preview && height <= 520 && Math.min(width, 1100) > height;
    this.root.classList.toggle('is-landscape', landscape);
    this.root.classList.toggle('is-short-landscape', landscape && height <= 360);
    this.root.classList.toggle('is-compact', !landscape && height <= 620);
    this.root.style.setProperty('--mobile-height', `${height}px`);
    const count = this.state?.puzzle.clues.length ?? 7;
    this.root.style.setProperty(
      '--notes-height',
      `${Math.max(128, Math.min(count > 5 ? 190 : 152, height * (count > 5 ? 0.24 : 0.2) - 10))}px`,
    );
    this.root.style.setProperty(
      '--tray-height',
      `${Math.max(148, Math.min(300, height * 0.27))}px`,
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
      ghost.style.width = `${bounds.width}px`;
      ghost.style.height = `${bounds.height}px`;
      document.body.append(ghost);
      press.ghost = ghost;
      press.source.classList.add('is-dragging');
    }
    press.ghost.style.left = `${event.clientX}px`;
    press.ghost.style.top = `${event.clientY - (event.pointerType === 'touch' ? 32 : 8)}px`;
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
