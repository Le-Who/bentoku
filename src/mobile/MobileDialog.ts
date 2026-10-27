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
    heading.id = 'mobile-dialog-title';
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

  close(): void {
    if (this.node.open) this.node.close();
  }

  destroy(): void {
    this.node.remove();
  }
}
