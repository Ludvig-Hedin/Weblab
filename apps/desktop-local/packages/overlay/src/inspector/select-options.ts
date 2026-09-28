import { type ChromeLayer } from "../chrome-layer";
import { cls, el } from "../dom";
import type { Surface } from "../surface";
import { localRect } from "../surface";

/**
 * A selectable copy of a native dropdown's options on the editor chrome.
 * Native popup windows cannot be inspected on the canvas, and Show must not
 * click or change the customer's control.
 */
export class SelectOptionsOverlay {
  private menu: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private select: HTMLSelectElement | null = null;
  private surface: Surface | null = null;
  private selected: Element | null = null;

  constructor(
    private readonly layer: ChromeLayer,
    private readonly onSelect: (
      option: HTMLOptionElement,
      surface: Surface
    ) => void
  ) {}

  get isOpen(): boolean {
    return this.menu !== null;
  }

  get owner(): HTMLSelectElement | null {
    return this.select;
  }

  show(select: HTMLSelectElement, surface: Surface, selected: Element): void {
    this.close();
    this.select = select;
    this.surface = surface;
    this.selected = selected;
    this.menu = el("div", {
      "aria-label": "Dropdown options",
      class: `${cls("layer")} ${cls("select-options-menu")}`,
      role: "listbox",
    });
    this.layer.add(this.menu);
    this.render();
    this.observer = new MutationObserver(() => this.render());
    this.observer.observe(select, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  updateSelected(node: Element | null): void {
    this.selected = node;
    if (this.menu) this.render();
  }

  refresh(): void {
    if (this.menu) this.render();
  }

  position(): void {
    const { menu, select, surface } = this;
    if (!(menu && select && surface?.isLive && select.isConnected)) {
      if (menu) this.close();
      return;
    }
    const box = surface.toScreen(localRect(select));
    const width = Math.max(172, box.width);
    const height = Math.min(280, select.options.length * 34 + 8);
    const below = box.top + box.height;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${
      below + height > window.innerHeight
        ? Math.max(8, box.top - height)
        : below
    }px`;
  }

  close(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.menu?.remove();
    this.menu = null;
    this.select = null;
    this.surface = null;
    this.selected = null;
  }

  private render(): void {
    const { menu, select, surface } = this;
    if (!(menu && select && surface)) return;
    menu.replaceChildren(
      ...Array.from(select.options, (option) => {
        const style = surface.win.getComputedStyle(option);
        const row = el("button", {
          "aria-selected": String(this.selected === option),
          class: cls("select-options-option"),
          disabled: option.disabled ? "" : undefined,
          onClick: () => {
            this.selected = option;
            this.onSelect(option, surface);
            this.render();
          },
          role: "option",
          text: option.label,
          type: "button",
        });
        row.style.color = style.color;
        row.style.backgroundColor = style.backgroundColor;
        row.style.fontFamily = style.fontFamily;
        row.style.fontSize = style.fontSize;
        row.style.fontWeight = style.fontWeight;
        return row;
      })
    );
    this.position();
  }
}
