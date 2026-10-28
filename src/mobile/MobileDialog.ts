import { VISUAL_THEMES, type VisualTheme } from '../game/VisualTheme';

export interface MobileAction {
  label: string;
  callback: () => void;
  primary?: boolean;
}

export interface MobileSlider {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

let dialogCount = 0;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className: string, action?: () => void): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

export class MobileDialog {
  readonly node = element('dialog', 'mobile-dialog');
  private content = element('div', 'mobile-dialog-content');
  private onClose = (): void => {};
  private readonly titleId = `bentoku-dialog-title-${++dialogCount}`;

  constructor() {
    this.node.append(this.content);
    this.node.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.onClose();
    });
    this.node.addEventListener('click', (event) => {
      if (event.target === this.node) this.onClose();
    });
    // Phaser's document keyboard shortcuts must not also consume dialog input.
    this.node.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(this.node);
  }

  show(
    title: string,
    body: string,
    actions: readonly MobileAction[],
    onClose: () => void,
    sliders: readonly MobileSlider[] = [],
  ): HTMLElement {
    this.onClose = onClose;
    this.content.replaceChildren();
    const heading = element('h2', 'mobile-dialog-title', title);
    heading.id = this.titleId;
    this.node.setAttribute('aria-labelledby', heading.id);
    const close = button('×', 'mobile-dialog-close', onClose);
    close.setAttribute('aria-label', 'Close');
    this.content.append(close, heading);
    if (body) this.content.append(element('p', 'mobile-dialog-body', body));
    for (const slider of sliders) {
      const label = element('label', 'mobile-slider');
      const caption = element('span', '', `${slider.label}: ${Math.round(slider.value * 100)}%`);
      const input = element('input', '');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(slider.value * 100));
      input.setAttribute('aria-label', slider.label);
      input.addEventListener('input', () => {
        caption.textContent = `${slider.label}: ${input.value}%`;
        slider.onChange(Number(input.value) / 100);
      });
      label.append(caption, input);
      this.content.append(label);
    }
    const controls = element('div', 'mobile-dialog-actions');
    for (const action of actions) {
      controls.append(
        button(
          action.label,
          `mobile-control${action.primary ? ' is-primary' : ''}`,
          action.callback,
        ),
      );
    }
    this.content.append(controls);
    if (!this.node.open) this.node.showModal();
    return this.content;
  }

  addThemePicker(current: VisualTheme, onSelect: (theme: VisualTheme) => void): void {
    const picker = element('fieldset', 'mobile-theme-picker');
    picker.append(element('legend', '', 'Appearance'));
    for (const theme of VISUAL_THEMES) {
      const card = element('label', 'mobile-theme-card');
      const input = element('input', '');
      input.type = 'radio';
      input.name = `${this.titleId}-visual-theme`;
      input.value = theme.id;
      input.checked = theme.id === current;
      input.addEventListener('change', () => {
        if (input.checked) onSelect(theme.id);
      });
      const preview = element('img', 'mobile-theme-preview');
      preview.src = `assets/themes/${theme.id}/preview.webp`;
      preview.alt = '';
      const copy = element('span', 'mobile-theme-copy');
      copy.append(
        element('strong', 'mobile-theme-name', theme.name),
        element('span', 'mobile-theme-description', theme.description),
      );
      card.append(input, preview, copy);
      picker.append(card);
    }
    const status = element('p', 'mobile-theme-status');
    status.setAttribute('role', 'status');
    picker.append(status);
    const controls = this.content.querySelector('.mobile-dialog-actions');
    this.content.insertBefore(picker, controls);
  }

  themeStatus(message: string, checked?: VisualTheme): void {
    const picker = this.content.querySelector('.mobile-theme-picker');
    const status = picker?.querySelector('.mobile-theme-status');
    if (status) status.textContent = message;
    if (checked)
      picker?.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((input) => {
        input.checked = input.value === checked;
      });
  }

  close(): void {
    if (this.node.open) this.node.close();
  }

  destroy(): void {
    this.node.remove();
  }
}
