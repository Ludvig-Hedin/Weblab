import { cls, el } from "../../dom";
import { icon } from "../../icons";
import { createMenu } from "../../popover-host";
import {
  fitCss,
  fitFromCss,
  type ImageBinding,
  type ImageFit,
  layerOfUrl,
  openImagePopover,
  urlOfLayer,
} from "../controls/image-popover";
import { createTextField } from "../controls/num-field";
import { createRowList } from "../controls/row-list";
import {
  type Fill,
  formatFillLayers,
  parseFillLayers,
  splitTop,
} from "../css-value";
import { hasFill } from "../gates";
import { consumeImageEditorReopen } from "../image-editor";
import { fillLayerRow, type OpenLayerImage } from "../paint";
import { readValue } from "../style-model";
import type { SectionContext } from "./context";
import { labelled } from "./row";

/**
 * The four properties that are parallel lists to `background-image`.
 *
 * CSS aligns them by index: layer 2's size is the second entry in
 * `background-size`. The panel had none of that — `background-size`,
 * `-position` and `-repeat` lived in the *Media* section as **single-valued**
 * selects, gated on `hasBackgroundImage` (which excluded gradients entirely). So
 * a two-layer background got one shared size, choosing "Cover" flattened both
 * layers to it, gradient layers had no geometry control at all, and
 * `background-blend-mode` — the per-fill blend — had no equivalent anywhere.
 */
const GEOMETRY = [
  { initial: "auto", label: "Size", property: "background-size" },
  { initial: "0% 0%", label: "Position", property: "background-position" },
  { initial: "repeat", label: "Repeat", property: "background-repeat" },
  { initial: "normal", label: "Blend", property: "background-blend-mode" },
] as const;

/**
 * Read one layer's entry out of a parallel list.
 *
 * A list shorter than the layer stack *repeats* in CSS, so a single `cover` applies to
 * every layer — which is why the modulo rather than a bounds check.
 */
function layerEntry(
  node: Element,
  property: string,
  index: number,
  initial: string
): string {
  const parts = splitTop(readValue(node, property));
  if (parts.length === 0) {
    return initial;
  }
  return parts[index % parts.length] ?? initial;
}

/**
 * Write one layer's entry back, leaving the others alone.
 *
 * Padded to the layer count first — with the list's own repeating value, not the initial,
 * so expanding a shared `cover` into four explicit entries does not silently change what
 * three of them mean.
 */
function writeLayerEntry(
  ctx: SectionContext,
  node: Element,
  property: string,
  index: number,
  initial: string,
  value: string,
  layerCount: number
): void {
  const next: string[] = [];
  for (let i = 0; i < Math.max(layerCount, index + 1); i += 1) {
    next.push(layerEntry(node, property, i, initial));
  }
  next[index] = value;
  ctx.onChange(property, next.join(", "));
}

/** The initial value of one parallel list, by property. */
function initialOf(property: string): string {
  return GEOMETRY.find((g) => g.property === property)?.initial ?? "";
}

/** The parallel lists CSS also aligns with the layers, beyond `GEOMETRY`. */
const OTHER_LISTS = [
  { initial: "normal", property: "background-blend-mode" },
  { initial: "scroll", property: "background-attachment" },
  { initial: "padding-box", property: "background-origin" },
  { initial: "border-box", property: "background-clip" },
] as const;

const URL_TOKEN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/**
 * Turn same-origin `url()`s back into root-relative ones.
 *
 * Computed style resolves every `url()` against the document, so a layer
 * authored as `url("/hero.jpg")` reads back as `url("http://localhost:4100/hero.jpg")`
 * — the proxy's address, which must never reach the user's source. Anything on
 * another origin is left exactly as it is.
 */
export function relativeUrls(css: string, node: Element): string {
  let origin = "";
  try {
    ({ origin } = new URL(node.ownerDocument.baseURI));
  } catch {
    return css;
  }
  if (!origin || origin === "null") {
    return css;
  }
  return css.replace(
    URL_TOKEN,
    (whole: string, _quote: string, inner: string) => {
      try {
        const url = new URL(inner);
        if (url.origin !== origin) {
          return whole;
        }
        return layerOfUrl(`${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Already relative (or not a URL at all): nothing to undo.
        return whole;
      }
    }
  );
}

/** `background-image` as the panel should write it back: pending edit first. */
function currentImages(ctx: SectionContext, node: Element): string {
  const raw =
    ctx.gate(node)("background-image") || readValue(node, "background-image");
  return raw && raw !== "none" ? relativeUrls(raw, node) : "";
}

/** How many layers `background-image` holds right now. */
function countLayers(node: Element): number {
  return parseFillLayers(readValue(node, "background-image")).length;
}

/**
 * The image popover's view of one background layer.
 *
 * `layer` is how the Fill rows hand over their own value, so a write goes
 * through the row list rather than around it. Without it (the Media section's
 * Background row) the layer is read from and written into `background-image`
 * directly. Size, position and repeat are always this layer's entries in the
 * parallel lists, so a two-layer background keeps the other layer's geometry.
 */
export function backgroundImageBinding(
  ctx: SectionContext,
  node: Element,
  index: number,
  layer?: { read: () => string; write: (css: string) => void }
): ImageBinding {
  const entry = (property: string): string =>
    layerEntry(node, property, index, initialOf(property));
  const writeEntry = (property: string, value: string): void =>
    writeLayerEntry(
      ctx,
      node,
      property,
      index,
      initialOf(property),
      value,
      countLayers(node)
    );
  return {
    baseUrl: node.ownerDocument.baseURI,
    kind: "background",
    read: () => {
      const current = layer
        ? layer.read()
        : (splitTop(readValue(node, "background-image"))[index] ?? "");
      return {
        alt: "",
        fit: fitFromCss("background", {
          repeat: entry("background-repeat"),
          size: entry("background-size"),
        }),
        position: entry("background-position"),
        src: urlOfLayer(current),
      };
    },
    setFit: (fit) => {
      ctx.batch(() => {
        for (const [property, value] of fitCss("background", fit)) {
          writeEntry(property, value);
        }
      });
      ctx.refresh();
    },
    setPosition: (position) => {
      writeEntry("background-position", position);
      ctx.reseed();
    },
    setSrc: (url) => {
      const css = layerOfUrl(url);
      if (layer) {
        layer.write(css);
      } else {
        const layers = splitTop(currentImages(ctx, node));
        layers[index] = css;
        ctx.onChange("background-image", layers.join(", "));
      }
      ctx.refresh();
    },
  };
}

/**
 * Put a new image layer on top of the stack, with its geometry.
 *
 * On top means first: CSS paints the first `background-image` layer over the
 * rest. Each parallel list gets the new layer's entry in front of the entries
 * the existing layers already had, so nothing underneath changes meaning.
 * Blend, attachment, origin and clip are only touched when they already list
 * per-layer values; a single shared value keeps applying to all of them.
 */
function insertImageLayer(
  ctx: SectionContext,
  node: Element,
  url: string,
  fit: ImageFit,
  position: string
): void {
  const layers = splitTop(currentImages(ctx, node));
  const count = layers.length;
  const existing = (
    property: string,
    initial = initialOf(property)
  ): string[] =>
    Array.from({ length: count }, (_, i) =>
      layerEntry(node, property, i, initial)
    );
  const first = new Map<string, string>([
    ...fitCss("background", fit),
    ["background-position", position],
  ]);
  const writes: [string, string][] = [
    ["background-image", [layerOfUrl(url), ...layers].join(", ")],
  ];
  for (const property of [
    "background-size",
    "background-position",
    "background-repeat",
  ]) {
    writes.push([
      property,
      [first.get(property) ?? initialOf(property), ...existing(property)].join(
        ", "
      ),
    ]);
  }
  // A single shared value keeps applying to every layer, the new one
  // included; a per-layer list has to make room for it.
  for (const { initial, property } of OTHER_LISTS) {
    if (count > 0 && splitTop(readValue(node, property)).length > 1) {
      writes.push([
        property,
        [initial, ...existing(property, initial)].join(", "),
      ]);
    }
  }
  ctx.batch(() => {
    for (const [property, value] of writes) {
      ctx.onChange(property, value);
    }
  });
  ctx.refresh();
}

/**
 * The popover for a layer that does not exist yet.
 *
 * Nothing is written until an image is chosen, so closing the popover without
 * one leaves the element exactly as it was. Type and position picked before
 * that are held and applied with the image.
 */
function newImageLayerBinding(
  ctx: SectionContext,
  node: Element
): ImageBinding {
  let added = false;
  let fit: ImageFit = "fill";
  let position = "50% 50%";
  const live = (): ImageBinding => backgroundImageBinding(ctx, node, 0);
  return {
    baseUrl: node.ownerDocument.baseURI,
    kind: "background",
    read: () => (added ? live().read() : { alt: "", fit, position, src: "" }),
    setFit: (next) => {
      if (added) {
        live().setFit(next);
      } else {
        fit = next;
      }
    },
    setPosition: (next) => {
      if (added) {
        live().setPosition(next);
      } else {
        position = next;
      }
    },
    setSrc: (url) => {
      if (added) {
        live().setSrc(url);
        return;
      }
      added = true;
      insertImageLayer(ctx, node, url, fit, position);
    },
  };
}

/** The key a Fill image row is reopened under after a rebuild. */
const reopenKey = (index: number): string => `fill-layer:${index}`;

/** The one solid-fill row: swatch, hex, alpha, and a minus that takes it away. */
function solidFillRow(
  ctx: SectionContext,
  node: Element,
  color: string
): HTMLElement {
  const row = el("div", { class: cls("rows-row") }, [
    ctx.colorRow(
      color,
      "Fill colour",
      (next) => ctx.onChange("background-color", next),
      node,
      ["background-color"]
    ),
    el(
      "button",
      {
        "aria-label": "Remove fill",
        class: cls("row-icon"),
        "data-tip": "Remove fill",
        onClick: () => {
          ctx.onChange("background-color", "transparent");
          row.remove();
        },
        type: "button",
      },
      [icon("minus", "xs")]
    ),
  ]);
  return row;
}

export function renderFill(ctx: SectionContext, node: Element): HTMLElement {
  const body = el("div", { class: cls("sect-body") });
  const color = readValue(node, "background-color") || "transparent";
  // A fully transparent background is *no fill*, not black at 0% — showing
  // `000000 / 0%` for every unstyled div is technically true and reads as a
  // bug. A design tool shows an empty section and a `+`; so does ctx.
  //
  // Asked through `ctx.gate`, so a pending `background-color` counts even when
  // the DOM refused it. Binding a colour token whose `var()` did not resolve
  // blanked the computed value, and this row — the one carrying the badge that
  // had just been used — deleted itself.
  const filled = hasFill(ctx.gate(node), node);

  // Held so "remove" can take just this row out, and the `+` can put one
  // back, without either rebuilding the panel.
  const solidRows = el("div", { class: cls("rows") });
  if (filled) {
    solidRows.append(solidFillRow(ctx, node, color));
  }
  body.append(solidRows);

  /** Enabled rows rendered so far in the current pass. See `render`. */
  let enabledBefore = 0;
  // Gradient and image layers ride on `background-image`, stacked above the
  // base colour — which is exactly how CSS paints them and how a design tool stacks
  // fills, so the two orderings agree for free.
  const layers = createRowList<Fill>(
    {
      blank: () => ({
        enabled: true,
        kind: "gradient",
        value: "linear-gradient(#ffffff, #cccccc)",
      }),
      cssProperty: "background-image",
      enabled: (r) => r.enabled,
      // Relative on the way in, so a round trip through the list never
      // writes the proxy's absolute address for a layer nobody touched.
      parse: (css) => parseFillLayers(relativeUrls(css, node)),
      render: (row, onEdit, _onDispose, index) => {
        /*
         * The row's position among the *painted* layers.
         *
         * A hidden row is dropped from the CSS, so row 2 behind a hidden row 1
         * is the second entry of every parallel list, not the third. Rows are
         * rendered in order, so counting the enabled ones seen so far is exact.
         */
        if (index === 0) {
          enabledBefore = 0;
        }
        const cssIndex = enabledBefore;
        if (row.enabled) {
          enabledBefore += 1;
        }
        const openImage: OpenLayerImage = (anchor, layer) => {
          openImagePopover(anchor, {
            ...backgroundImageBinding(ctx, node, cssIndex, layer),
            gestures: ctx.gestures,
            isCurrent: () => node.isConnected && anchor.isConnected,
            reopenKey: reopenKey(index),
          });
        };
        const content = el("div", { class: cls("fill-layer") }, [
          // A hidden layer has no entry in the CSS lists to edit, so it gets
          // neither the image popover nor geometry until it is shown again.
          fillLayerRow(
            row,
            onEdit,
            ctx.gestures,
            node,
            row.enabled ? openImage : undefined
          ),
          // Per-layer geometry, for the layers that have any. A solid colour is
          // painted by `background-color` and has no size, position or repeat.
          ...(row.kind === "solid" || !row.enabled
            ? []
            : [layerGeometry(ctx, node, cssIndex)]),
        ]);
        if (
          row.kind === "image" &&
          consumeImageEditorReopen(reopenKey(index))
        ) {
          // The panel rebuilt under an open image popover (the first image
          // layer adds a Background block to Media). Open it again here.
          queueMicrotask(() =>
            content.querySelector<HTMLElement>(`.${cls("fill-thumb")}`)?.click()
          );
        }
        return content;
      },
      serialize: formatFillLayers,
      setEnabled: (r, on) => ({ ...r, enabled: on }),
    },
    readValue(node, "background-image"),
    ctx.onChange
  );
  ctx.register(layers);
  body.append(layers.element);

  const addImage = (anchor: HTMLElement): void => {
    openImagePopover(anchor, {
      ...newImageLayerBinding(ctx, node),
      gestures: ctx.gestures,
      isCurrent: () => node.isConnected && anchor.isConnected,
      // The new layer is first in the list, so its row is row 0.
      reopenKey: reopenKey(0),
    });
  };
  const plus = ctx.headerAction("plus", "Add fill", () => {
    // The first `+` gives you a solid fill, the way a design tool's does. Only
    // once there is one does it offer layers to stack on top: a gradient or an
    // image. "Is there one" is asked of the live row rather than of `filled`,
    // which was captured when the section was built and goes stale the moment
    // the remove button above takes the row away.
    if (solidRows.childElementCount) {
      createMenu([
        { icon: "fill-gradient", label: "Gradient", run: () => layers.add() },
        { icon: "fill-image", label: "Image", run: () => addImage(plus) },
      ]).open(plus, "below");
    } else {
      // Appended in place, matching the remove button above it — which
      // has always taken its row out without a rebuild. A fill appearing
      // does not change any other section.
      ctx.onChange("background-color", "#FFFFFF");
      solidRows.append(solidFillRow(ctx, node, "#FFFFFF"));
    }
  });
  return ctx.section("fill", "Fill", body, { actions: [plus] });
}

/** One layer's size, position, repeat and blend, as a compact sub-row. */
function layerGeometry(
  ctx: SectionContext,
  node: Element,
  index: number
): HTMLElement {
  const wrap = el("div", { class: cls("fill-geom") });
  for (const { initial, label, property } of GEOMETRY) {
    const field = createTextField({ label, placeholder: initial });
    const reflect = (): void => {
      const value = layerEntry(node, property, index, initial);
      field.input.value = value === initial ? "" : value;
    };
    reflect();
    let skipBlur = false;
    const commit = (): void => {
      if (skipBlur) {
        skipBlur = false;
        return;
      }
      const typed = field.input.value.trim() || initial;
      if (typed === layerEntry(node, property, index, initial)) {
        return;
      }
      /*
       * The layer count comes from the DOM, not from the row list.
       *
       * Closing over the list would be circular — `render` is part of the spec the list is
       * built from — and the declaration is the honest source anyway: it is what the
       * parallel lists have to stay aligned with.
       */
      writeLayerEntry(
        ctx,
        node,
        property,
        index,
        initial,
        typed,
        parseFillLayers(readValue(node, "background-image")).length
      );
    };
    field.input.addEventListener("blur", commit);
    field.input.addEventListener("keydown", (e) => {
      const { key } = e as KeyboardEvent;
      if (key === "Enter") {
        field.input.blur();
      } else if (key === "Escape") {
        e.stopPropagation();
        reflect();
        skipBlur = true;
        field.input.blur();
      }
    });
    ctx.register({
      element: field.element,
      resync: reflect,
      setValue: () => undefined,
      virtual: true,
    });
    wrap.append(labelled(label, field.element));
  }
  return wrap;
}
