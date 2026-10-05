/**
 * The left dock's Variables tab — the project's design variables (CSS custom
 * properties), laid out like Figma's variables table.
 *
 * Collections down the top (one per kind of value, plus All). Under them a
 * table: one row per variable, one value column for the default and one per
 * mode — a theme such as Dark, or a breakpoint such as Tablet. Clicking a
 * value opens a picker: type a value, pick a colour, or connect it to another
 * variable from a list.
 *
 * Every write goes straight to the stylesheet the variable lives in, through
 * the editor server — no agent turn — and each one is an undo step. The fresh
 * scan the server broadcasts repaints this table and every bound field in the
 * Design panel.
 */

import type { ClientMessage } from "@airship/protocol";
import {
  type DesignToken,
  looksLikeColor,
  TOKEN_CATEGORIES,
  type TokenCategory,
  type TokenMode,
} from "@airship/protocol/tokens";
import { clear, cls, el } from "../dom";
import { type IconName, icon } from "../icons";
import { openColorPicker } from "../inspector/controls/color-picker";
import { openPopover, type PopoverHandle } from "../popover-host";
import { fileTokens, onTokensChange } from "../tokens/registry";

/** One write to the editor server, as the `token:write` message carries it. */
export type VariableWrite = Omit<
  Extract<ClientMessage, { type: "token:write" }>,
  "type"
>;

/** An undoable variable write: what was done and how to take it back. */
export interface VariableStep {
  redo: VariableWrite;
  undo: VariableWrite;
}

export interface VariablesPanelDeps {
  /**
   * Show a variable at a value on the page without writing it — the colour
   * picker's live drag. `null` removes the preview.
   */
  preview?: (name: string, value: string | null) => void;
  /** Journal a finished write so ⌘Z can take it back. */
  record?: (step: VariableStep) => void;
  /** Injected in tests; the live subscription otherwise. */
  subscribe?: (listener: () => void) => () => void;
  /** Injected in tests; the live file scan otherwise. */
  variables?: () => DesignToken[];
  /** Send a write to the editor server. False when there is no connection. */
  write: (change: VariableWrite) => boolean;
}

type Collection = TokenCategory | "all";
type NewMode = NonNullable<VariableWrite["mode"]>;

const COLLECTION_NAMES: Record<TokenCategory, string> = {
  "border-radius": "Radius",
  "border-width": "Border width",
  "box-shadow": "Shadows",
  colors: "Colors",
  "font-family": "Fonts",
  "font-size": "Font size",
  "font-weight": "Font weight",
  "letter-spacing": "Letter spacing",
  "line-height": "Line height",
  opacity: "Opacity",
  sizing: "Sizing",
  spacing: "Spacing",
};

/** The prefix a variable's name repeats from its collection, to hide. */
const COLLECTION_PREFIX: Record<TokenCategory, RegExp> = {
  "border-radius": /^(radius|rounded|border-radius)-/,
  "border-width": /^(border-width|border)-/,
  "box-shadow": /^(shadow|elevation)-/,
  colors: /^(colors?|clr)-/,
  "font-family": /^(font-family|font|ff)-/,
  "font-size": /^(font-size|text|fs)-/,
  "font-weight": /^(font-weight|weight|fw)-/,
  "letter-spacing": /^(letter-spacing|tracking)-/,
  "line-height": /^(line-height|leading|lh)-/,
  opacity: /^opacity-/,
  sizing: /^(sizing|size)-/,
  spacing: /^(spacing|space|gap)-/,
};

/** Colors first, as in Figma and Webflow; then the scale's own order. */
const ORDER: readonly TokenCategory[] = [
  "colors",
  ...TOKEN_CATEGORIES.filter((category) => category !== "colors"),
];

const NEW_MODES: readonly { id: string; label: string; mode: NewMode }[] = [
  { id: "dark", label: "Dark mode", mode: "dark" },
  { id: "max-991px", label: "Tablet (up to 991px)", mode: "tablet" },
  { id: "max-767px", label: "Mobile (up to 767px)", mode: "mobile" },
];

const COLLECTION_KEY = "__airship-vars-collection";
const LEADING_DASHES = /^-*/;
const WHITESPACE = /\s+/g;
const NOT_NAME = /[^\w-]/g;
const HEX = /^#[0-9a-f]{3,8}$/i;
const EXACT_VAR = /^var\(\s*(--[\w-]+)\s*\)$/;
/**
 * How long a drag preview outlives its write. The dev server reloads the
 * stylesheet a moment after the file changes; dropping the preview at once
 * would flash the old colour in between.
 */
const PREVIEW_HOLD_MS = 1500;
/** Past the end of any file: "the declaration nearest the end". */
const LAST_LINE = 1_000_000;
const EMPTY =
  "No variables yet. Create one to reuse a color or size across your site.";

function readCollection(): Collection {
  try {
    const saved = localStorage.getItem(COLLECTION_KEY);
    if (saved && (saved === "all" || saved in COLLECTION_NAMES)) {
      return saved as Collection;
    }
  } catch {
    // Private mode: start on All.
  }
  return "all";
}

/** `brand color` → `--brand-color`. */
export function toVariableName(input: string): string {
  const slug = input
    .trim()
    .replace(LEADING_DASHES, "")
    .replace(WHITESPACE, "-")
    .replace(NOT_NAME, "");
  return slug ? `--${slug}` : "";
}

/** A variable's name without `--` and without the collection it repeats. */
export function friendlyName(token: DesignToken): string {
  const bare = token.name.replace(LEADING_DASHES, "");
  const stripped = bare.replace(COLLECTION_PREFIX[token.category], "");
  return stripped || bare;
}

/** What a value reads as: `FF0000` for a hex, as written otherwise. */
export function displayValue(value: string): string {
  const trimmed = value.trim();
  if (HEX.test(trimmed)) {
    return trimmed.slice(1).toUpperCase();
  }
  return trimmed;
}

function aliasTarget(value: string): string | null {
  return EXACT_VAR.exec(value.trim())?.[1] ?? null;
}

function iconFor(category: TokenCategory): IconName {
  if (category === "colors") {
    return "var-color";
  }
  return category === "font-family" ? "var-text" : "var-value";
}

interface Row {
  group: string;
  label: string;
  token: DesignToken;
}

/**
 * Rows for one collection, with a group per shared first word — `brand-primary`
 * and `brand-secondary` become "primary" and "secondary" under "brand", as
 * Figma shows `Brand/primary`.
 */
function rowsFor(tokens: DesignToken[]): Row[] {
  const names = tokens.map((token) => friendlyName(token));
  const firsts = new Map<string, number>();
  for (const name of names) {
    const [first, ...rest] = name.split("-");
    if (rest.length) {
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
  }
  return tokens.map((token, i) => {
    const [first, ...rest] = names[i].split("-");
    const grouped = rest.length > 0 && (firsts.get(first) ?? 0) > 1;
    return {
      group: grouped ? first : "",
      label: grouped ? rest.join("-") : names[i],
      token,
    };
  });
}

/** The value a variable has in `mode` (null: the default), as authored. */
function authored(token: DesignToken, mode: TokenMode | null): string | null {
  if (mode) {
    return token.modes?.[mode.id]?.value ?? null;
  }
  return token.aliasOf ? `var(${token.aliasOf})` : (token.values[""] ?? "");
}

/** Themes first, then breakpoints, each in the order first seen. */
function modesOf(tokens: DesignToken[]): TokenMode[] {
  const seen = new Map<string, TokenMode>();
  for (const token of tokens) {
    for (const mode of Object.values(token.modes ?? {})) {
      if (!seen.has(mode.id)) {
        seen.set(mode.id, { id: mode.id, kind: mode.kind, label: mode.label });
      }
    }
  }
  const list = [...seen.values()];
  return [
    ...list.filter((m) => m.kind === "theme"),
    ...list.filter((m) => m.kind === "breakpoint"),
  ];
}

export class VariablesPanel {
  readonly element: HTMLElement;

  private readonly deps: VariablesPanelDeps;
  private readonly variables: () => DesignToken[];
  private readonly search: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly body: HTMLElement;
  private collection: Collection = readCollection();
  private query = "";
  private creating = false;
  /** Freshly revealed from the Design panel: highlighted once. */
  private flash: string | null = null;
  /** The write in flight and how to undo it; its result journals it. */
  private pending: (VariableStep & { name: string }) | null = null;
  private picker: PopoverHandle | null = null;
  /** The colour picker is open on a swatch; a repaint would orphan it. */
  private colorOpen = false;

  constructor(deps: VariablesPanelDeps) {
    this.deps = deps;
    this.variables = deps.variables ?? fileTokens;
    const subscribe = deps.subscribe ?? ((fn) => onTokensChange(fn));
    // Not while typing a new one: a rescan would wipe the half-typed row.
    subscribe(() => {
      if (!(this.creating || this.colorOpen)) {
        this.render();
      }
    });

    this.search = el("input", {
      "aria-label": "Search variables",
      class: cls("layers-search"),
      placeholder: "Search variables",
      spellcheck: "false",
      type: "search",
    }) as HTMLInputElement;
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim().toLowerCase();
      this.render();
    });
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.search.value) {
        e.stopPropagation();
        this.search.value = "";
        this.query = "";
        this.render();
      }
    });
    this.status = el("div", { class: cls("vars-status") });
    this.status.hidden = true;
    this.body = el("div", { class: `${cls("vars-body")} ${cls("scroll-y")}` });
    this.element = el("div", { class: cls("vars") }, [
      el("div", { class: cls("vars-head") }, [
        el(
          "div",
          { class: `${cls("layers-search-wrap")} ${cls("vars-search")}` },
          [icon("search", "sm"), this.search]
        ),
      ]),
      this.status,
      this.body,
      el("div", { class: cls("vars-foot") }, [
        el(
          "button",
          {
            class: cls("vars-create"),
            onClick: () => this.startCreate(),
            type: "button",
          },
          [icon("plus", "sm"), el("span", { text: "Create variable" })]
        ),
      ]),
    ]);
    this.render();
  }

  /** The tab came into view. The scan is live, so just repaint. */
  show(): void {
    this.render();
  }

  /** Show one variable and open its value — the Design panel's edit button. */
  reveal(name: string): void {
    const token = this.all().find((t) => t.name === name);
    if (!token) {
      return;
    }
    this.query = "";
    this.search.value = "";
    this.collection = token.category;
    this.flash = name;
    this.render();
    const cell = this.body.querySelector<HTMLElement>(
      `[data-var="${CSS.escape(name)}"] [data-mode=""]`
    );
    if (cell) {
      cell.scrollIntoView({ block: "nearest" });
      this.openPicker(cell, token, null);
    }
  }

  /** The server's answer to a write this panel sent. */
  onWriteResult(result: {
    error?: string;
    file?: string;
    name: string;
    ok: boolean;
  }): void {
    if (!this.pending || result.name !== this.pending.name) {
      return;
    }
    const { redo, undo } = this.pending;
    this.pending = null;
    if (!result.ok) {
      this.setStatus(result.error ?? "Could not save the variable.", true);
      return;
    }
    this.setStatus(null);
    // A create learns its file only now; its undo needs it.
    this.deps.record?.({
      redo,
      undo: { ...undo, file: undo.file ?? result.file },
    });
  }

  private setStatus(text: string | null, error = false): void {
    this.status.hidden = !text;
    this.status.textContent = text ?? "";
    this.status.toggleAttribute("data-error", error);
  }

  private send(step: VariableStep): void {
    this.pending = { ...step, name: step.redo.name };
    if (this.deps.write(step.redo)) {
      this.setStatus(null);
    } else {
      this.pending = null;
      this.setStatus("Not connected to the editor. Reopen the site.", true);
    }
  }

  private setCollection(next: Collection): void {
    this.collection = next;
    try {
      localStorage.setItem(COLLECTION_KEY, next);
    } catch {
      // Private mode: the choice lasts this session.
    }
    this.render();
  }

  private startCreate(): void {
    this.creating = true;
    this.render();
  }

  /** Every variable the tab lists: custom properties found in a file. */
  private all(): DesignToken[] {
    return this.variables().filter(
      (token) => token.kind === "css-var" && token.file
    );
  }

  private matches(row: Row): boolean {
    if (!this.query) {
      return true;
    }
    const { token } = row;
    return (
      token.name.toLowerCase().includes(this.query) ||
      (token.values[""] ?? "").toLowerCase().includes(this.query)
    );
  }

  render(): void {
    this.picker?.close();
    this.picker = null;
    clear(this.body);
    const all = this.all();
    const byCategory = new Map<TokenCategory, DesignToken[]>();
    for (const token of all) {
      const list = byCategory.get(token.category) ?? [];
      list.push(token);
      byCategory.set(token.category, list);
    }
    const used = ORDER.filter((category) => byCategory.has(category));
    if (this.collection !== "all" && !used.includes(this.collection)) {
      this.collection = "all";
    }

    this.body.append(this.collections(used, byCategory, all.length));
    if (this.creating) {
      this.body.append(this.createRow());
    }
    if (all.length === 0) {
      if (!this.creating) {
        this.body.append(el("div", { class: cls("vars-empty"), text: EMPTY }));
      }
      return;
    }

    const modes = modesOf(all);
    const table = el("div", { class: cls("vars-table") });
    table.style.setProperty("--vars-values", String(modes.length + 1));
    table.append(this.headerRow(modes, all));
    const shown = this.collection === "all" ? used : [this.collection];
    let count = 0;
    for (const category of shown) {
      const rows = rowsFor(byCategory.get(category) ?? []).filter((row) =>
        this.matches(row)
      );
      if (rows.length > 0) {
        count += rows.length;
        table.append(this.section(category, rows, modes, all));
      }
    }
    if (count === 0) {
      table.append(
        el("div", { class: cls("vars-empty"), text: "No variables match." })
      );
    }
    this.body.append(el("div", { class: cls("vars-scroll-x") }, [table]));
    this.flash = null;
  }

  private collections(
    used: TokenCategory[],
    byCategory: Map<TokenCategory, DesignToken[]>,
    total: number
  ): HTMLElement {
    const button = (id: Collection, label: string, count: number) =>
      el(
        "button",
        {
          "aria-current": String(this.collection === id),
          class: cls("vars-col"),
          onClick: () => this.setCollection(id),
          type: "button",
        },
        [
          el("span", { class: cls("vars-col-name"), text: label }),
          el("span", { class: cls("vars-count"), text: String(count) }),
        ]
      );
    return el("nav", { "aria-label": "Collections", class: cls("vars-cols") }, [
      el("div", { class: cls("vars-label"), text: "Collections" }),
      button("all", "All variables", total),
      ...used.map((category) =>
        button(
          category,
          COLLECTION_NAMES[category],
          byCategory.get(category)?.length ?? 0
        )
      ),
    ]);
  }

  private headerRow(modes: TokenMode[], all: DesignToken[]): HTMLElement {
    const missing = NEW_MODES.filter(
      (candidate) => !modes.some((m) => m.id === candidate.id)
    );
    const add = el(
      "button",
      {
        "aria-label": "Add a mode or breakpoint",
        class: cls("row-icon"),
        "data-tip": "Add a mode or breakpoint",
        type: "button",
      },
      [icon("plus", "xs")]
    );
    add.addEventListener("click", () => this.openModeMenu(add, missing, all));
    return el("div", { class: `${cls("vars-grid")} ${cls("vars-th")}` }, [
      el("span", { text: "Name" }),
      el("span", { text: modes.length ? "Default" : "Value" }),
      ...modes.map((mode) => el("span", { text: mode.label })),
      el("span", { class: cls("vars-th-add") }, [add]),
    ]);
  }

  private section(
    category: TokenCategory,
    rows: Row[],
    modes: TokenMode[],
    all: DesignToken[]
  ): HTMLElement {
    const section = el("div", { class: cls("vars-section") });
    if (this.collection === "all") {
      section.append(
        el("div", {
          class: cls("vars-section-title"),
          text: COLLECTION_NAMES[category],
        })
      );
    }
    let group: string | null = null;
    for (const row of rows) {
      if (row.group && row.group !== group) {
        section.append(
          el("div", { class: cls("vars-group"), text: row.group })
        );
      }
      ({ group } = row);
      section.append(this.row(row, modes, all));
    }
    return section;
  }

  private row(row: Row, modes: TokenMode[], all: DesignToken[]): HTMLElement {
    const { token } = row;
    const line = el(
      "div",
      {
        class: `${cls("vars-grid")} ${cls("vars-row")}`,
        "data-var": token.name,
      },
      [
        el("div", { class: cls("vars-name"), "data-tip": token.name }, [
          el("span", { class: cls("vars-type") }, [
            icon(iconFor(token.category), "sm"),
          ]),
          el("span", { class: cls("vars-text"), text: row.label }),
        ]),
        this.valueCell(token, null, all),
        ...modes.map((mode) => this.valueCell(token, mode, all)),
        el("span"),
      ]
    );
    if (this.flash === token.name) {
      line.dataset.flash = "";
    }
    return line;
  }

  /** Follow `var(--x)` through the scan to a literal, for swatches. */
  private resolve(value: string, all: DesignToken[]): string {
    const target = aliasTarget(value);
    if (!target) {
      return value;
    }
    return all.find((t) => t.name === target)?.values[""] ?? value;
  }

  private valueCell(
    token: DesignToken,
    mode: TokenMode | null,
    all: DesignToken[]
  ): HTMLElement {
    const own = authored(token, mode);
    const value = own ?? authored(token, null) ?? "";
    const target = aliasTarget(value);
    const resolved = this.resolve(value, all);
    // A div, not a button: a colour's swatch is its own button inside it.
    const cell = el("div", {
      "aria-label": `Edit ${friendlyName(token)}`,
      class: cls("vars-value"),
      "data-mode": mode?.id ?? "",
      "data-tip": own === null ? "Same as Default. Click to change" : undefined,
      role: "button",
      tabindex: "0",
    });
    if (own === null) {
      cell.dataset.inherited = "";
    }
    const chip = el("span", { class: cls("vars-chip") });
    if (looksLikeColor(resolved)) {
      chip.append(this.swatchButton(token, mode, resolved));
    }
    if (target) {
      const other = all.find((t) => t.name === target);
      cell.dataset.alias = "";
      chip.append(
        el("span", {
          class: cls("vars-text"),
          text: other ? friendlyName(other) : target.slice(2),
        })
      );
    } else {
      chip.append(
        el("span", { class: cls("vars-text"), text: displayValue(value) })
      );
    }
    cell.append(chip);
    cell.addEventListener("click", () => this.openPicker(cell, token, mode));
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.openPicker(cell, token, mode);
      }
    });
    return cell;
  }

  /** Drop a drag preview — at once, or once the saved file has reloaded. */
  private endPreview(name: string, saved: boolean): void {
    const drop = () => this.deps.preview?.(name, null);
    if (saved) {
      setTimeout(drop, PREVIEW_HOLD_MS);
    } else {
      drop();
    }
  }

  /** A colour's swatch: click it for the full colour picker. */
  private swatchButton(
    token: DesignToken,
    mode: TokenMode | null,
    color: string
  ): HTMLElement {
    const swatch = el("button", {
      "aria-label": `Change ${friendlyName(token)} color`,
      class: `${cls("vars-swatch")} ${cls("vars-swatch-btn")}`,
      "data-tip": "Pick a color",
      type: "button",
    });
    swatch.style.background = color;
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openColor(swatch, token, mode, color);
    });
    return swatch;
  }

  /**
   * The editor's own colour picker — area, hue, alpha, eyedropper, recent
   * colours — on a variable. The swatch follows the drag; the file is written
   * once, when the picker closes, so a drag is one undo step.
   */
  private openColor(
    swatch: HTMLElement,
    token: DesignToken,
    mode: TokenMode | null,
    color: string
  ): void {
    this.picker?.close();
    let latest: string | null = null;
    this.colorOpen = true;
    // Only the default is previewed: a Dark value painted onto a light page
    // would show a colour the page never has.
    const live = mode === null;
    openColorPicker({
      anchor: swatch,
      onChange: (next) => {
        latest = next;
        swatch.style.background = next;
        if (live) {
          this.deps.preview?.(token.name, next);
        }
      },
      onClose: () => {
        this.colorOpen = false;
        if (latest && latest !== color) {
          this.commit(token, mode, latest);
        }
        if (live) {
          this.endPreview(token.name, latest !== null && latest !== color);
        }
      },
      value: color,
    });
  }

  /**
   * The value editor: a field for a typed value, a colour well for colours,
   * and a list of variables to connect this one to — Figma's picker.
   */
  private openPicker(
    anchor: HTMLElement,
    token: DesignToken,
    mode: TokenMode | null
  ): void {
    this.picker?.close();
    const all = this.all();
    const current = authored(token, mode) ?? authored(token, null) ?? "";
    const target = aliasTarget(current);
    const resolved = this.resolve(current, all);
    const input = el("input", {
      "aria-label": "Value, or search variables",
      class: cls("vars-input"),
      placeholder: target ? "Type a value or search" : "",
      spellcheck: "false",
      type: "text",
    }) as HTMLInputElement;
    input.value = target ? "" : current;
    const top = el("div", { class: cls("vars-pick-top") }, [input]);
    if (token.category === "colors" && looksLikeColor(resolved)) {
      const well = el("button", {
        "aria-label": "Open color picker",
        class: cls("vars-well"),
        "data-tip": "Pick a color",
        type: "button",
      });
      well.style.background = resolved;
      well.addEventListener("click", () => {
        const swatch =
          anchor.querySelector<HTMLElement>(`.${cls("vars-swatch-btn")}`) ??
          anchor;
        this.openColor(swatch, token, mode, resolved);
      });
      top.prepend(well);
    }
    const list = el("div", {
      class: `${cls("pop-menu")} ${cls("vars-pick-list")} ${cls("scroll-y")}`,
    });
    const content = el("div", { class: cls("vars-pick") }, [top, list]);
    const choices = all.filter(
      (t) => t.category === token.category && t.name !== token.name
    );

    const renderList = () => {
      clear(list);
      if (target) {
        list.append(
          this.pickItem("Detach variable", null, () =>
            this.commit(token, mode, resolved)
          )
        );
      }
      const needle = input.value.trim().toLowerCase();
      const searching = needle && needle !== current.toLowerCase();
      const shown = choices.filter(
        (t) =>
          !searching ||
          t.name.toLowerCase().includes(needle) ||
          friendlyName(t).toLowerCase().includes(needle)
      );
      if (shown.length) {
        list.append(
          el("div", {
            class: cls("vars-label"),
            text: target
              ? "Swap for another variable"
              : "Connect to a variable",
          })
        );
      }
      for (const other of shown) {
        const item = this.pickItem(
          friendlyName(other),
          other.values[""] ?? "",
          () => this.commit(token, mode, `var(${other.name})`)
        );
        if (other.name === target) {
          item.classList.add(cls("pop-item-on"));
        }
        list.append(item);
      }
      this.picker?.reposition();
    };
    input.addEventListener("input", renderList);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const typed = input.value.trim();
        if (typed && typed !== current) {
          this.commit(token, mode, typed);
        } else {
          this.picker?.close();
        }
      } else if (e.key === "Escape") {
        e.stopPropagation();
        this.picker?.close();
      }
    });

    this.picker = openPopover({
      anchor,
      className: "pop-vars",
      content,
      onClose: () => {
        this.picker = null;
      },
    });
    renderList();
    input.focus();
    input.select();
  }

  private pickItem(
    label: string,
    value: string | null,
    run: () => void
  ): HTMLElement {
    const main = el("span", { class: cls("pop-item-main") });
    if (value !== null && looksLikeColor(value)) {
      const swatch = el("span", { class: cls("vars-swatch") });
      swatch.style.background = value;
      main.append(swatch);
    }
    main.append(el("span", { class: cls("vars-text"), text: label }));
    const item = el(
      "button",
      { class: cls("pop-item"), "data-pop-item": "", type: "button" },
      [main]
    );
    if (value !== null) {
      item.append(
        el("span", { class: cls("pop-item-hint"), text: displayValue(value) })
      );
    }
    item.addEventListener("click", run);
    return item;
  }

  /** Write `value` for `token` in `mode`, as one undoable step. */
  private commit(
    token: DesignToken,
    mode: TokenMode | null,
    value: string
  ): void {
    this.picker?.close();
    const before = authored(token, mode);
    if (before === value) {
      return;
    }
    const existing = mode ? token.modes?.[mode.id] : null;
    if (!mode || existing) {
      const at = {
        file: existing ? existing.file : token.file,
        line: existing ? existing.line : token.line,
        name: token.name,
      };
      this.send({
        redo: { ...at, op: "set", value },
        undo: { ...at, op: "set", value: before ?? "" },
      });
      return;
    }
    // No value in this mode yet: add one inside the mode's block, next to a
    // variable that already has one there — the same file where possible.
    const anchor = this.modeAnchor(mode, token.file);
    if (!anchor) {
      this.setStatus(`Can't find where ${mode.label} is written.`, true);
      return;
    }
    this.send({
      redo: {
        afterLine: anchor.line,
        file: anchor.file,
        name: token.name,
        op: "create",
        value,
      },
      undo: {
        file: anchor.file,
        line: anchor.line + 1,
        name: token.name,
        op: "delete",
      },
    });
  }

  private modeAnchor(
    mode: TokenMode,
    file?: string
  ): { file: string; line: number } | null {
    let fallback: { file: string; line: number } | null = null;
    for (const token of this.all()) {
      const entry = token.modes?.[mode.id];
      if (!entry) {
        continue;
      }
      if (entry.file === file) {
        return entry;
      }
      fallback ??= entry;
    }
    return fallback;
  }

  private openModeMenu(
    anchor: HTMLElement,
    missing: readonly { id: string; label: string; mode: NewMode }[],
    all: DesignToken[]
  ): void {
    const seed =
      all.find(
        (t) => this.collection === "all" || t.category === this.collection
      ) ?? all[0];
    if (!seed) {
      return;
    }
    const content = el("div", { class: cls("pop-menu") });
    const handle = openPopover({ anchor, className: "pop-vars", content });
    const add = (mode: NewMode, modeName?: string) => {
      handle.close();
      this.send({
        redo: {
          mode,
          modeName,
          name: seed.name,
          op: "add-mode",
          value: authored(seed, null) ?? "",
        },
        undo: {
          file: seed.file,
          line: LAST_LINE,
          name: seed.name,
          op: "delete",
        },
      });
    };
    for (const choice of missing) {
      content.append(this.pickItem(choice.label, null, () => add(choice.mode)));
    }
    // A theme of the user's own naming, written as `[data-theme="name"]`.
    content.append(
      this.pickItem("Custom mode…", null, () => {
        const name = el("input", {
          "aria-label": "Mode name",
          class: cls("vars-input"),
          placeholder: "Mode name, like brand",
          spellcheck: "false",
          type: "text",
        }) as HTMLInputElement;
        name.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && name.value.trim()) {
            e.preventDefault();
            add("custom", name.value.trim());
          } else if (e.key === "Escape") {
            e.stopPropagation();
            handle.close();
          }
        });
        content.replaceChildren(
          el("div", { class: cls("vars-pick-top") }, [name])
        );
        handle.reposition();
        name.focus();
      })
    );
    handle.reposition();
  }

  private createRow(): HTMLElement {
    const name = el("input", {
      "aria-label": "New variable name",
      class: cls("vars-input"),
      placeholder: "Name, like brand color",
      spellcheck: "false",
      type: "text",
    }) as HTMLInputElement;
    const value = el("input", {
      "aria-label": "New variable value",
      class: cls("vars-input"),
      placeholder: "Value, like #0D99FF",
      spellcheck: "false",
      type: "text",
    }) as HTMLInputElement;
    const cancel = () => {
      this.creating = false;
      this.render();
    };
    const submit = () => {
      const full = toVariableName(name.value);
      const typed = value.value.trim();
      if (!(full && typed)) {
        this.setStatus("Give the variable a name and a value.", true);
        return;
      }
      this.creating = false;
      this.send({
        redo: { name: full, op: "create", value: typed },
        undo: { name: full, op: "delete" },
      });
      this.render();
    };
    for (const input of [name, value]) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (input === name) {
            value.focus();
          } else {
            submit();
          }
        } else if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      });
    }
    queueMicrotask(() => name.focus());
    return el("div", { class: cls("vars-new") }, [
      el("div", { class: cls("vars-label"), text: "New variable" }),
      el("div", { class: cls("vars-new-fields") }, [name, value]),
    ]);
  }
}
