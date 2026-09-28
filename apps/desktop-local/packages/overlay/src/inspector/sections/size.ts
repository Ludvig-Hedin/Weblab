import { cls, el } from "../../dom";
import { type IconName, icon } from "../../icons";
import { createMenu, type MenuHandle } from "../../popover-host";
import { counterpart, isLocked, toggleLock } from "../aspect";
import { keywordsFor, parseLength } from "../css-length";
import { MODE_NOTE, MODE_TEXT, SIZE_GROUP } from "../descriptors";
import { hasBounds } from "../gates";
import {
  type Axis,
  availableModes,
  layoutSize,
  type ResizeMode,
  resizeMode,
  writeResize,
} from "../sizing";
import type { SectionContext } from "./context";

/**
 * W and H with the design-tool resizing modes — Figma's Resizing row.
 *
 * Split out of the generic `GROUPS` pipeline because the mode buttons are not
 * a CSS property — "Fill" is `flex: 1 1 0%` on a flex child and `width: 100%`
 * everywhere else, so the control has to know about the parent. See
 * `sizing.ts` for the table.
 */
const MODE_ICON: Record<ResizeMode, IconName> = {
  fill: "size-fill",
  fixed: "size-fixed",
  hug: "size-hug",
};

/**
 * The words that are a *mode*, not a length.
 *
 * Typing one of these into the field is the same act as clicking the matching
 * button, and is routed there rather than written as a declaration — otherwise
 * `width: max-content` lands but the Hug cell beside it stays unlit, which is
 * the panel disagreeing with itself about what the element is doing.
 */
const MODE_FOR_KEYWORD: Record<string, ResizeMode | undefined> = {
  // `auto` means "let the layout decide", which is Fill inside a flex parent
  // and the closest thing to it elsewhere. `writeResize` owns that distinction.
  auto: "fill",
  "fit-content": "hug",
  "max-content": "hug",
  "min-content": "hug",
};

/** What a W or H field takes. `%` of the containing block is the common one. */
const SIZE_UNITS = ["px", "%", "em", "rem", "vw", "vh"];

/**
 * One axis: the measured number, with the mode word inside the same field.
 *
 * Figma's shape: `W 1920  Fill ▾`. The number is always the element's real
 * size, so Hug and Fill still say how big the element came out; the word at
 * the right end opens Fixed / Hug / Fill, and the min and max toggle.
 */
function renderAxis(
  ctx: SectionContext,
  node: Element,
  axis: Axis,
  bounds: { open: boolean; locked: boolean; toggle: () => void }
): HTMLElement {
  const property = axis === "w" ? "width" : "height";
  const shown = (): string => String(Math.round(layoutSize(node, axis)));

  const field = ctx.numControl(
    {
      fieldKey: property,
      glyph: axis === "w" ? "W" : "H",
      keywords: keywordsFor(property),
      label: axis === "w" ? "Width" : "Height",
      min: 0,
      unit: "px",
      units: SIZE_UNITS,
    },
    shown(),
    (css) => {
      const mode = MODE_FOR_KEYWORD[css.trim().toLowerCase()];
      if (mode) {
        applyMode(mode);
        return;
      }
      if (!parseLength(css, SIZE_UNITS)) {
        ctx.onChange(property, css);
        return;
      }
      for (const d of writeResize(node, axis, "fixed", css)) {
        ctx.onChange(d.property, d.value);
      }
      // A locked ratio carries the edit to the other axis.
      const other = counterpart(node, axis, css);
      if (other !== null) {
        const otherAxis = axis === "w" ? "h" : "w";
        for (const d of writeResize(node, otherAxis, "fixed", other)) {
          ctx.onChange(d.property, d.value);
        }
      }
      paintMode();
    },
    [property, "flex", "align-self"],
    shown
  );

  const available = new Set(availableModes(node, axis));
  const word = el("span");
  const mode = el(
    "button",
    {
      "aria-expanded": "false",
      "aria-haspopup": "menu",
      "aria-label": `${axis === "w" ? "Width" : "Height"} resizing`,
      class: cls("size-mode"),
      type: "button",
    },
    [word, icon("caret-down", "xs")]
  );
  const paintMode = (): void => {
    const now = resizeMode(node, axis);
    word.textContent = MODE_TEXT[now];
    mode.dataset.tip = `${MODE_TEXT[now]}. ${MODE_NOTE[now]}`;
  };
  paintMode();
  // The word follows undo, a canvas resize and agent edits, not only clicks.
  ctx.register({
    element: mode,
    properties: [property, "flex", "align-self"],
    setValue: () => paintMode(),
  });

  function applyMode(next: ResizeMode): void {
    const measured = layoutSize(node, axis);
    for (const d of writeResize(
      node,
      axis,
      next,
      `${Math.round(measured)}px`
    )) {
      ctx.onChange(d.property, d.value);
    }
    paintMode();
    field.setValue(shown());
  }

  let menu: MenuHandle | null = null;
  mode.addEventListener("click", (event) => {
    event.stopPropagation();
    const now = resizeMode(node, axis);
    const modes = (["fixed", "hug", "fill"] as const).map((m) => ({
      disabled: !available.has(m),
      hint: available.has(m) ? undefined : "Needs a parent",
      icon: MODE_ICON[m],
      label: `${MODE_TEXT[m]} ${axis === "w" ? "width" : "height"}`,
      on: m === now,
      run: () => applyMode(m),
      tip: MODE_NOTE[m],
    }));
    let boundsLabel = "Add min and max";
    if (bounds.locked) {
      boundsLabel = "Min and max are set";
    } else if (bounds.open) {
      boundsLabel = "Hide min and max";
    }
    menu = createMenu([
      ...modes,
      { separator: true },
      {
        disabled: bounds.locked,
        icon: axis === "w" ? "size-min-w" : "size-min-h",
        label: boundsLabel,
        run: bounds.toggle,
      },
    ]);
    mode.setAttribute("aria-expanded", "true");
    menu.open(field.element, "below", {
      matchAnchorWidth: true,
      onClose: () => {
        mode.setAttribute("aria-expanded", "false");
        menu = null;
      },
    });
  });
  // The design-token affordance sits inside the field, just before the mode
  // word, so neither covers the other.
  const slot = ctx.tokenSlot(node, [property]);
  field.setToken(slot?.label ?? null);
  field.onActivate(() => slot?.open());
  field.element.append(...(slot ? [slot.element] : []), mode);
  return field.element;
}

/**
 * The aspect-ratio lock: a ghost icon in the action lane beside W and H.
 *
 * Lit when on, so a locked element says so without being hovered — the state
 * changes what the fields do, and a switch that hides its state is a trap.
 */
function lockButton(ctx: SectionContext, node: Element): HTMLElement {
  const on = isLocked(node);
  const tip = on ? "Unlock aspect ratio" : "Lock aspect ratio";
  const button = el(
    "button",
    {
      "aria-label": tip,
      "aria-pressed": String(on),
      class: `${cls("lane-act")} ${cls("aspect-lock")}`,
      "data-tip": tip,
      onClick: () => {
        toggleLock(node);
        ctx.rerender();
      },
      type: "button",
    },
    [icon(on ? "aspect-lock" : "aspect-unlock", "sm")]
  );
  return button;
}

/**
 * The Resizing group: W and H side by side, the ratio lock in the action lane,
 * and min / max below when they are set or asked for.
 *
 * Returned as blocks for the Layout section to place, because in Figma this is
 * part of Layout rather than a section of its own.
 */
export function renderResizing(
  ctx: SectionContext,
  node: Element,
  state: { showBounds: boolean }
): HTMLElement[] {
  const constrained = hasBounds(ctx.gate(node));
  const bounds = {
    locked: constrained,
    open: constrained || state.showBounds,
    toggle: () => {
      if (constrained) {
        return;
      }
      state.showBounds = !state.showBounds;
      ctx.rerender();
    },
  };
  const lane = el("div", { class: cls("lane") }, [
    renderAxis(ctx, node, "w", bounds),
    renderAxis(ctx, node, "h", bounds),
    lockButton(ctx, node),
  ]);
  lane.dataset.act = "";
  const blocks: HTMLElement[] = [
    el("div", { class: `${cls("fgroup")} ${cls("group")}` }, [
      el("span", { class: cls("flabel"), text: "Resizing" }),
      lane,
    ]),
  ];
  if (bounds.open) {
    const descriptors = SIZE_GROUP.descriptors.filter((d) =>
      d.key.startsWith("m")
    );
    blocks.push(
      el(
        "div",
        { class: cls("lane") },
        descriptors.map((d) => ctx.fieldCell(d, node))
      )
    );
  }
  return blocks;
}
