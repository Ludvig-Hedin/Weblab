import { cls, el } from "../../dom";
import { type IconName, icon } from "../../icons";
import { computedStyle } from "../../realm";
import { createAlignPad } from "../controls/align-pad";
import { bindField, createTextField } from "../controls/num-field";
import { createNumberScrub } from "../controls/number-scrub";
import { createSegmented } from "../controls/segmented";
import {
  ALIGN_ITEMS_GRID,
  type Descriptor,
  GRID_AUTO_FLOW,
  GRID_GAP,
  JUSTIFY_ITEMS,
  LAYOUT_GAP,
} from "../descriptors";

/** Singularises the track-kind label: "Columns" -> "column". */
const TRAILING_S = /s$/;

import {
  formatTracks,
  parseTracks,
  type TrackSpec,
  trackProperty,
} from "../grid";
import { declaredValue } from "../sizing";
import { readValue } from "../style-model";
import type { SectionContext } from "./context";
import { renderResizing } from "./size";

/** Flow: the four ways a box lays out its children, as Figma's Flow row. */
const FLOW: Descriptor = {
  controlType: "segmented",
  cssProperty: "display",
  defaultValue: "block",
  enumValues: [
    { icon: "square", label: "No auto layout", value: "block" },
    { icon: "al-vertical", label: "Vertical", value: "column" },
    { icon: "al-horizontal", label: "Horizontal", value: "row" },
    { icon: "grid", label: "Grid", value: "grid" },
  ],
  group: "layout",
  key: "flow",
  label: "Flow",
  span: "full",
};

type Flow = "block" | "column" | "row" | "grid";

/** Matches no Flow option, so a hidden element lights none of them. */
const NO_FLOW = "-";

function readFlow(node: Element): Flow | "" {
  const style = computedStyle(node);
  if (style.display === "flex" || style.display === "inline-flex") {
    return style.flexDirection.startsWith("column") ? "column" : "row";
  }
  if (style.display === "grid" || style.display === "inline-grid") {
    return "grid";
  }
  // Hidden and box-less elements light no Flow option: none of the four
  // describes them, and lighting "No auto layout" would say something false.
  return style.display === "none" || style.display === "contents"
    ? ""
    : "block";
}

/** A small label above its controls: "Flow", "Resizing", "Padding". */
function stacked(label: string, ...controls: HTMLElement[]): HTMLElement {
  return el("div", { class: `${cls("fgroup")} ${cls("group")}` }, [
    el("span", { class: cls("flabel"), text: label }),
    ...controls,
  ]);
}

/**
 * Layout, in Figma's order: Flow, Resizing, Alignment and Gap, Padding,
 * Margin, Clip content.
 *
 * Size and Spacing used to be sections of their own. Figma keeps all of it in
 * one place because it is one decision — how this box sits and how it lays
 * out what is inside it — and so does this panel now. Margin has no Figma
 * equivalent; it sits under Padding, where a web designer looks for it.
 *
 * The section changes shape with the element: a box that is not an auto
 * layout shows Flow, Resizing and spacing, and nothing that would write into
 * a `display: block` and do nothing.
 */
export function renderAutoLayout(
  ctx: SectionContext,
  node: Element,
  sizeState: { showBounds: boolean },
  opts: { resizingOnly?: boolean } = {}
): HTMLElement {
  const body = el("div", { class: cls("sect-body") });
  if (opts.resizingOnly) {
    body.append(...renderResizing(ctx, node, sizeState));
    return ctx.section("auto-layout", "Layout", body);
  }

  const flow = readFlow(node);
  const isFlex = flow === "row" || flow === "column";
  const isGrid = flow === "grid";
  body.append(renderFlow(ctx, node, flow));
  body.append(...renderResizing(ctx, node, sizeState));

  if (isFlex) {
    body.append(renderFlexAlignment(ctx, node));
  }
  if (isGrid) {
    body.append(stacked("Tracks", renderGridTracks(ctx, node)));
    const gaps = el("div", { class: cls("lane") });
    for (const axis of ["row", "column"] as const) {
      gaps.append(ctx.fieldCell(GRID_GAP(axis), node));
    }
    body.append(stacked("Gap", gaps));
    const placement = el("div", { class: cls("group") });
    for (const descriptor of [
      JUSTIFY_ITEMS,
      ALIGN_ITEMS_GRID,
      GRID_AUTO_FLOW,
    ]) {
      placement.append(ctx.fieldCell(descriptor, node));
    }
    body.append(placement);
  }

  for (const group of ["padding", "margin"] as const) {
    const control = ctx.spacingControl(node, group);
    ctx.register(control);
    body.append(
      stacked(group === "padding" ? "Padding" : "Margin", control.element)
    );
  }

  const clip = renderClip(ctx, node);
  if (clip) {
    body.append(clip);
  }
  return ctx.section(
    "auto-layout",
    isFlex || isGrid ? "Auto layout" : "Layout",
    body
  );
}

/**
 * Flow, and the wrap switch in the action lane beside it.
 *
 * A pick that changes the layout system rebuilds the section, because what
 * sits under Flow depends on it. `inline-flex` and `inline-grid` keep their
 * inline-ness across a pick: the element's outside behaviour is not what the
 * user asked about.
 */
function renderFlow(
  ctx: SectionContext,
  node: Element,
  flow: Flow | ""
): HTMLElement {
  const seg = createSegmented(FLOW, flow || NO_FLOW, ctx.onChange, {
    derive: () => readFlow(node) || NO_FLOW,
    onSelect: (value) => {
      writeFlow(ctx, node, value as Flow);
      ctx.rerender();
    },
    properties: ["display", "flex-direction"],
  });
  ctx.register(seg);

  const lane = el("div", { class: cls("lane") }, [seg.element]);
  seg.element.classList.add(cls("span2"));
  lane.dataset.act = "";
  if (flow === "row" || flow === "column") {
    const wrapped = (): boolean =>
      (
        declaredValue(node, "flex-wrap") || computedStyle(node).flexWrap
      ).startsWith("wrap");
    const wrapBtn = el(
      "button",
      {
        "aria-label": "Wrap",
        "aria-pressed": String(wrapped()),
        class: cls("lane-act"),
        "data-tip": "Wrap onto new lines",
        onClick: () => {
          const next = !wrapped();
          ctx.onChange("flex-wrap", next ? "wrap" : "nowrap");
          wrapBtn.setAttribute("aria-pressed", String(next));
        },
        type: "button",
      },
      [icon("al-wrap", "sm")]
    );
    ctx.register({
      element: wrapBtn,
      properties: ["flex-wrap"],
      setValue: (_property, value) =>
        wrapBtn.setAttribute("aria-pressed", String(value.startsWith("wrap"))),
    });
    lane.append(wrapBtn);
  }
  return stacked("Flow", lane);
}

/** The display this pick means, keeping `inline-` if the element had it. */
function displayFor(node: Element, pick: Flow): string {
  const { display } = computedStyle(node);
  const inline = display.startsWith("inline");
  if (pick === "block") {
    return inline ? "inline-block" : "block";
  }
  if (pick === "grid") {
    return inline ? "inline-grid" : "grid";
  }
  if (display === "flex" || display === "inline-flex") {
    return display;
  }
  return inline ? "inline-flex" : "flex";
}

/**
 * Writes a Flow pick. Reverse-ness is a property of the axis the user did not
 * ask about, so a pick that keeps the axis keeps `row-reverse` as it was.
 */
function writeFlow(ctx: SectionContext, node: Element, pick: Flow): void {
  ctx.onChange("display", displayFor(node, pick));
  if (pick === "row" || pick === "column") {
    const dir = declaredValue(node, "flex-direction") || "row";
    const same = dir === pick || dir === `${pick}-reverse`;
    ctx.onChange("flex-direction", same ? dir : pick);
  }
}

/**
 * Alignment and Gap, side by side, the way Figma lays them out: the 3×3 pad
 * in the first lane, the gap field in the second, and Space between in the
 * action lane beside the gap it replaces.
 */
function renderFlexAlignment(ctx: SectionContext, node: Element): HTMLElement {
  const style = computedStyle(node);
  const direction = (): "row" | "column" =>
    computedStyle(node).flexDirection.startsWith("column") ? "column" : "row";
  const pad = createAlignPad(
    direction,
    { align: style.alignItems, justify: style.justifyContent },
    ctx.onChange
  );
  ctx.register(pad);

  const gap = createNumberScrub(
    LAYOUT_GAP(direction() === "column"),
    readValue(node, "gap") || "0px",
    ctx.onChange,
    ctx.gestures
  );
  ctx.register(gap);
  // The gap glyph names the axis it runs along, so it follows an undo or an
  // agent edit that flips the direction, not only a Flow click.
  ctx.register({
    element: gap.element,
    properties: ["flex-direction"],
    setValue: () =>
      gap.element
        .querySelector(`.${cls("ctl-glyph")}`)
        ?.replaceChildren(
          icon(direction() === "column" ? "gap-v" : "gap-h", "sm")
        ),
  });
  const gapSlot = ctx.tokenSlot(node, ["gap"]);
  gap.setToken?.(gapSlot?.label ?? null);
  gap.onActivate?.(() => gapSlot?.open());
  const gapField = gapSlot
    ? el("div", { class: cls("token-cell") }, [gap.element, gapSlot.element])
    : gap.element;

  pad.spread.classList.add(cls("after-label"));
  const lane = el("div", { class: `${cls("lane")} ${cls("group")}` }, [
    el("div", { class: `${cls("fgroup")} ${cls("al-pad")}` }, [
      el("span", { class: cls("flabel"), text: "Alignment" }),
      pad.element,
    ]),
    el("div", { class: cls("fgroup") }, [
      el("span", { class: cls("flabel"), text: "Gap" }),
      gapField,
    ]),
    pad.spread,
  ]);
  lane.dataset.act = "";
  return lane;
}

/**
 * Clip content, as Figma's checkbox. Only on a box with children, because
 * clipping nothing is a switch that does nothing.
 */
function renderClip(ctx: SectionContext, node: Element): HTMLElement | null {
  if (node.childElementCount === 0) {
    return null;
  }
  const box = el("span", { class: cls("check-box") });
  const button = el(
    "button",
    {
      class: `${cls("check")} ${cls("group")}`,
      "data-tip": "Clip anything outside this element",
      onClick: () => {
        const now = readValue(node, "overflow") === "hidden";
        ctx.onChange("overflow", now ? "visible" : "hidden");
        paint(!now);
      },
      role: "checkbox",
      type: "button",
    },
    [box, el("span", { text: "Clip content" })]
  );
  const paint = (on: boolean): void => {
    button.setAttribute("aria-checked", String(on));
    box.replaceChildren(...(on ? [icon("check", "xs")] : []));
  };
  paint(readValue(node, "overflow") === "hidden");
  ctx.register({
    element: button,
    properties: ["overflow"],
    setValue: (_property, value) => paint(value === "hidden"),
  });
  return button;
}

/**
 * CSS Grid tracks, in Layout Grid vocabulary. See `grid.ts` for the
 * mapping and for why a hand-written track list is shown rather than rewritten.
 */
function renderGridTracks(ctx: SectionContext, node: Element): HTMLElement {
  const wrap = el("div", { class: cls("grid-tracks") });
  // A track edit re-renders this block and nothing else. It used to rebuild
  // the whole panel, which meant editing a column count scrolled the Effects
  // section you were also working in back out of view.
  /*
   * Swaps this block for a freshly built one.
   *
   * The outgoing tree's controls go with it: `numControl`, `fieldCell` and
   * `register` all land in the panel's registry, and nothing was taking them
   * out — so after a few track edits `reseed` was writing into detached DOM.
   */
  const repaintTracks = ctx.repaintScope();
  const repaint = (): void =>
    repaintTracks(() => wrap.replaceWith(renderGridTracks(ctx, node)));

  for (const kind of ["columns", "rows"] as const) {
    const property = trackProperty(kind);
    /*
     * The **authored** value, not the computed one.
     *
     * `getComputedStyle().gridTemplateColumns` on a laid-out grid is the resolved track
     * list — `320px 320px 320px` — which `REPEAT` never matches. So `parseTracks`
     * returned null for every real grid, the raw-text branch always won, and the
     * scrubbable count field, the per-track size field and `formatTracks` were dead
     * code that no element could reach. `declaredValue` is what the stylesheet says.
     */
    const raw = declaredValue(node, property) || readValue(node, property);
    const spec = parseTracks(raw, kind);
    const glyph: IconName = kind === "columns" ? "grid-columns" : "grid-rows";

    if (!spec) {
      // An explicit track list. Editable as text, but not pretended to be a
      // count-and-size — that would silently destroy it.
      const custom = createTextField({
        glyph,
        label: `Custom ${kind} track list`,
      });
      custom.input.value = raw;
      bindField(
        custom.input,
        () => {
          ctx.onChange(property, custom.input.value.trim());
          // Repaint, as the count/size path below does. Whether this field is a
          // raw text box or a count-and-size pair is decided by whether
          // `parseTracks` can read the value — so typing a `repeat(3, 1fr)`
          // into it leaves the panel showing the wrong control for its own
          // value until something unrelated rebuilds.
          repaint();
        },
        () => {
          custom.input.value = raw;
          custom.input.blur();
        }
      );
      wrap.append(custom.element);
      continue;
    }

    const write = (next: TrackSpec): void => {
      ctx.onChange(property, formatTracks(next));
      repaint();
    };
    // The count is a number and behaves like one — scrubbable, integer-only,
    // no unit. The *size* beside it is not: `1fr`, `minmax(120px, 1fr)` and
    // `auto` are all ordinary values for it, so it stays a text field. A
    // numeric control there would have to reject most of what belongs in it.
    const countIn = ctx.numControl(
      {
        fieldKey: `${property}-count`,
        glyph,
        label: `Number of ${kind.toLowerCase()}`,
        min: 0,
        step: 1,
        unit: "",
      },
      String(spec.count),
      (css) => {
        const n = Number.parseInt(css, 10);
        if (!Number.isNaN(n)) {
          write({ ...spec, count: Math.max(0, n) });
        }
      },
      [property],
      (value) => String(parseTracks(value, kind)?.count ?? spec.count)
    );
    const sizeIn = createTextField({
      glyph: "size-fixed",
      label: `Size of each ${kind.toLowerCase().replace(TRAILING_S, "")}`,
    });
    sizeIn.input.value = spec.size;
    bindField(
      sizeIn.input,
      () => write({ ...spec, size: sizeIn.input.value.trim() || "1fr" }),
      () => {
        sizeIn.input.value = spec.size;
        sizeIn.input.blur();
      }
    );
    const row = el("div", { class: cls("grid") });
    row.append(countIn.element, sizeIn.element);
    wrap.append(row);
  }

  // No `gap` shorthand here: the caller gives a grid `row-gap` and
  // `column-gap` as separate fields, and a third control writing the same
  // declaration would silently overwrite the pair.
  return wrap;
}
