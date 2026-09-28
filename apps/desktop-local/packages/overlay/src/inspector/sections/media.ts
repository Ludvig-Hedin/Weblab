/**
 * Media — `<img>`, `<video>`, and raster background images.
 *
 * The one section that writes HTML *attributes* as well as CSS. `object-fit` is
 * a style; `alt` is not, and pretending otherwise would send the agent looking
 * for a stylesheet rule that can never exist. The two go through different
 * paths — `ctx.onChange` for declarations, `ctx.onAttr` for attributes — and
 * land in different arrays on the wire.
 */
import { uploadImage } from "../../assets/client";
import { cls, el } from "../../dom";
import { icon } from "../../icons";
import {
  displayName,
  fitCss,
  fitFromCss,
  type ImageBinding,
  layerOfUrl,
  openImagePopover,
  resolveSrc,
  urlOfLayer,
} from "../controls/image-popover";
import { createTextField } from "../controls/num-field";
import { createSegmented } from "../controls/segmented";
import { createSelect } from "../controls/select";
import { parseFillLayers } from "../css-value";
import type { Descriptor, EnumOption } from "../descriptors";
import {
  hasBackgroundImage,
  isImage,
  isRasterImage,
  isVideo,
} from "../element-kind";
import { consumeImageEditorReopen, registerImageEditor } from "../image-editor";
import { readValue } from "../style-model";
import type { SectionContext } from "./context";
import { backgroundImageBinding } from "./fill";
import { enumDescriptor, labelled } from "./row";

const POSITIONS: EnumOption[] = [
  { label: "Center", value: "50% 50%" },
  { label: "Top", value: "50% 0%" },
  { label: "Bottom", value: "50% 100%" },
  { label: "Left", value: "0% 50%" },
  { label: "Right", value: "100% 50%" },
  { label: "Top left", value: "0% 0%" },
  { label: "Top right", value: "100% 0%" },
  { label: "Bottom left", value: "0% 100%" },
  { label: "Bottom right", value: "100% 100%" },
];

const OBJECT_FIT = enumDescriptor(
  "objectFit",
  "object-fit",
  "Fit",
  [
    { label: "Fill", value: "fill" },
    { label: "Contain", value: "contain" },
    { label: "Cover", value: "cover" },
    { label: "None", value: "none" },
    { label: "Scale down", value: "scale-down" },
  ],
  "fill"
);

const BG_SIZE = enumDescriptor(
  "backgroundSize",
  "background-size",
  "Size",
  [
    { label: "Auto", value: "auto" },
    { label: "Cover", value: "cover" },
    { label: "Contain", value: "contain" },
    { label: "Stretch", value: "100% 100%" },
  ],
  "auto"
);

const BG_REPEAT = enumDescriptor(
  "backgroundRepeat",
  "background-repeat",
  "Repeat",
  [
    { label: "No repeat", value: "no-repeat" },
    { label: "Repeat", value: "repeat" },
    { label: "Repeat X", value: "repeat-x" },
    { label: "Repeat Y", value: "repeat-y" },
    { label: "Space", value: "space" },
    { label: "Round", value: "round" },
  ],
  "repeat"
);

const BG_ATTACHMENT = enumDescriptor(
  "backgroundAttachment",
  "background-attachment",
  "Attachment",
  [
    { label: "Scroll", value: "scroll" },
    { label: "Fixed", value: "fixed" },
    { label: "Local", value: "local" },
  ],
  "scroll"
);

const BG_CLIP = enumDescriptor(
  "backgroundClip",
  "background-clip",
  "Clip",
  [
    { label: "Border box", value: "border-box" },
    { label: "Padding box", value: "padding-box" },
    { label: "Content box", value: "content-box" },
    { label: "Text", value: "text" },
  ],
  "border-box"
);

/** Attribute toggles are yes/no, but the word differs — Show/Hide reads better
 * for `controls` than Yes/No does. */
function boolOptions(on: string, off: string): EnumOption[] {
  return [
    { label: on, value: "on" },
    { label: off, value: "off" },
  ];
}

function attrDescriptor(
  key: string,
  label: string,
  values: EnumOption[]
): Descriptor {
  return {
    controlType: "segmented",
    // A pseudo-property: this control writes an attribute, not a declaration,
    // and must never match a real CSS property on re-seed.
    cssProperty: `--attr-${key}`,
    defaultValue: "off",
    enumValues: values,
    group: "appearance",
    key,
    label,
    span: "full",
  };
}

/**
 * Whether the rarely-touched `<img>` attributes are showing.
 *
 * Module state rather than per render: the section rebuilds on every change
 * of selection, and a disclosure that snapped shut each time would have to be
 * reopened for every image in a row of thumbnails.
 */
let moreOpen = false;

/**
 * The `<img>` element's view for the image popover.
 *
 * A new `src` also drops `srcset` and `sizes`: the browser prefers a srcset
 * candidate over `src`, so swapping only `src` on a responsive image (every
 * Next.js `<Image>`) changes the markup and leaves the old picture on screen.
 * All three writes are one undo step.
 */
export function imgBinding(ctx: SectionContext, node: Element): ImageBinding {
  return {
    baseUrl: node.ownerDocument.baseURI,
    kind: "img",
    read: () => ({
      alt: node.getAttribute("alt") ?? "",
      fit: fitFromCss("img", { objectFit: readValue(node, "object-fit") }),
      position: readValue(node, "object-position"),
      src: node.getAttribute("src") ?? "",
    }),
    setAlt: (alt) => ctx.onAttr(node, "alt", alt === "" ? null : alt),
    setFit: (fit) => {
      for (const [property, value] of fitCss("img", fit)) {
        ctx.onChange(property, value);
      }
      ctx.reseed();
    },
    setPosition: (position) => {
      ctx.onChange("object-position", position);
      ctx.reseed();
    },
    setSrc: (url) => {
      ctx.batch(() => {
        ctx.onAttr(node, "src", url);
        for (const attribute of ["srcset", "sizes"]) {
          if (node.hasAttribute(attribute)) {
            ctx.onAttr(node, attribute, null);
          }
        }
      });
    },
  };
}

/**
 * An `<img>` whose `<picture>` offers `<source>` candidates.
 *
 * The browser paints the first matching source, so a new `src` on the `<img>`
 * changes nothing on screen. Clearing the sources' `srcset` would, but an
 * attribute edit is described to the agent against the selected element, so
 * it would land on the `<img>` in code while the preview showed something
 * else. Pointed at the code instead.
 */
function hasResponsiveSources(node: Element): boolean {
  const parent = node.parentElement;
  return (
    parent?.tagName.toUpperCase() === "PICTURE" &&
    Array.from(parent.children).some(
      (child) =>
        child.tagName.toUpperCase() === "SOURCE" && child.hasAttribute("srcset")
    )
  );
}

/** The first background layer that is a picture, or -1. */
function firstImageLayer(node: Element): number {
  return parseFillLayers(readValue(node, "background-image")).findIndex(
    (layer) => layer.kind === "image" && urlOfLayer(layer.value) !== ""
  );
}

/**
 * The row a design tool shows for an image fill: a thumbnail and a file name,
 * and the whole row opens the image popover.
 *
 * Registered with the panel so an undo or an agent edit repaints it, and with
 * the image-editor registry so the canvas can open the same popover. Both go
 * when the row is torn down.
 */
function imageRow(
  ctx: SectionContext,
  binding: () => ImageBinding,
  key: string
): HTMLElement {
  const thumb = el("span", { class: cls("img-thumb") });
  const name = el("span", { class: cls("img-row-name") });
  const row = el(
    "button",
    {
      class: `${cls("img-row")} ${cls("span2")}`,
      type: "button",
    },
    [thumb, name]
  );
  const open = (): void => {
    if (!row.isConnected) {
      return;
    }
    openImagePopover(row, {
      ...binding(),
      gestures: ctx.gestures,
      // Torn down with the panel: a different element, or this one rebuilt.
      isCurrent: () => live,
      reopenKey: key,
    });
  };
  row.addEventListener("click", open);

  const paint = (): void => {
    const current = binding();
    const { src } = current.read();
    const shown = displayName(src);
    thumb.style.setProperty(
      "background-image",
      `${src ? layerOfUrl(resolveSrc(src, current.baseUrl)) : "none"}, var(--${cls("checker")})`
    );
    name.textContent = shown || "No image";
    name.toggleAttribute("data-empty", !shown);
    row.setAttribute("aria-label", `Image: ${shown || "none"}. Change image`);
    row.dataset.tip = "Change image";
  };
  paint();

  // From the canvas the row may sit in a section the user folded; unfold it,
  // or the popover would anchor to a box that is not on screen.
  const openFromCanvas = (): void => {
    const head = row.closest(`.${cls("sect")}`)?.firstElementChild;
    if (head?.getAttribute("aria-expanded") === "false") {
      (head as HTMLElement).click();
    }
    row.scrollIntoView?.({ block: "nearest" });
    open();
  };

  let live = true;
  const unregister = registerImageEditor(
    openFromCanvas,
    async (file) => {
      const asset = await uploadImage(file);
      if (!live) {
        return false;
      }
      binding().setSrc(asset.url);
      return true;
    },
    (url) => binding().setSrc(url)
  );
  ctx.register({
    destroy: () => {
      live = false;
      unregister();
    },
    element: row,
    resync: paint,
    setValue: () => undefined,
    virtual: true,
  });
  if (consumeImageEditorReopen(key)) {
    queueMicrotask(open);
  }
  return row;
}

/**
 * A closed-by-default group for the attributes most people never touch.
 *
 * `display: contents` on the body, so the rows inside still sit in the
 * section's field grid exactly as they did before they were grouped.
 */
function moreGroup(rows: HTMLElement[]): HTMLElement[] {
  const inner = el("div", { class: cls("img-more-body") }, rows);
  inner.hidden = !moreOpen;
  const toggle = el(
    "button",
    {
      "aria-expanded": String(moreOpen),
      class: `${cls("img-more")} ${cls("span2")}`,
      type: "button",
    },
    [icon("chev-right", "xs"), el("span", { text: "More" })]
  );
  toggle.addEventListener("click", () => {
    moreOpen = !moreOpen;
    inner.hidden = !moreOpen;
    toggle.setAttribute("aria-expanded", String(moreOpen));
  });
  return [toggle, inner];
}

export function renderMedia(ctx: SectionContext, node: Element): HTMLElement {
  const body = el("div", { class: cls("sect-body") });
  const image = isImage(node);
  const video = isVideo(node);

  // `<img>` only, not every IMAGE_TAG: on `<picture>` the `<source>` children
  // decide what paints, and a new `src` on the wrapper would change nothing.
  if (isRasterImage(node)) {
    if (hasResponsiveSources(node)) {
      body.append(
        el("div", {
          class: `${cls("img-note")} ${cls("span2")}`,
          text: "This image has responsive sources. Edit them in code.",
        })
      );
    } else {
      body.append(imageRow(ctx, () => imgBinding(ctx, node), "media-img"));
    }
  }

  if (image || video) {
    body.append(ctx.fieldCell(OBJECT_FIT, node));
    // Preset *plus* a field: `object-position: 20% 30%` matched no option, so any
    // interaction with the bare select snapped it to one of the nine.
    body.append(positionRow(ctx, node, "object-position", "Position"));
  }

  // `<img>` only, not every IMAGE_TAG: `<canvas>` has no alt/loading/decoding,
  // and on `<picture>` they belong to the inner `<img>`.
  if (isRasterImage(node)) {
    /*
     * Which image it is lives in the image row above (and its popover, which
     * also takes a pasted URL). `srcset` and `sizes` stay editable by hand, but
     * behind More with the loading hints: a new source from the popover already
     * clears them, so they are rarely the thing anyone came here for.
     */
    body.append(textAttr(ctx, node, "alt", "Alt text"));
    body.append(
      ...moreGroup([
        textAttr(ctx, node, "srcset", "Srcset"),
        textAttr(ctx, node, "sizes", "Sizes"),
        attrToggle(ctx, node, "loading", "Loading", [
          { label: "Lazy", value: "lazy" },
          { label: "Eager", value: "eager" },
        ]),
        attrToggle(ctx, node, "decoding", "Decoding", [
          { label: "Auto", value: "auto" },
          { label: "Async", value: "async" },
          { label: "Sync", value: "sync" },
        ]),
      ])
    );
  }

  if (video) {
    for (const [name, label, words] of [
      ["autoplay", "Autoplay", boolOptions("Yes", "No")],
      ["loop", "Loop", boolOptions("Yes", "No")],
      ["muted", "Muted", boolOptions("Yes", "No")],
      ["controls", "Controls", boolOptions("Show", "Hide")],
      ["playsinline", "Inline", boolOptions("Yes", "No")],
    ] as const) {
      body.append(booleanAttr(ctx, node, name, label, words));
    }
    // `src` for the same reason `<img>` has it — a `<video>` had a poster and no way to
    // change what it played.
    body.append(textAttr(ctx, node, "src", "Source"));
    body.append(textAttr(ctx, node, "poster", "Poster"));
  }

  if (hasBackgroundImage(node)) {
    body.append(el("div", { class: cls("sect-sub-head"), text: "Background" }));
    const layer = firstImageLayer(node);
    if (layer !== -1 && !isRasterImage(node)) {
      body.append(
        imageRow(
          ctx,
          () => backgroundImageBinding(ctx, node, layer),
          "media-bg"
        )
      );
    }
    body.append(ctx.fieldCell(BG_SIZE, node));
    body.append(positionRow(ctx, node, "background-position", "Position"));
    for (const descriptor of [BG_REPEAT, BG_ATTACHMENT, BG_CLIP]) {
      body.append(ctx.fieldCell(descriptor, node));
    }
  }

  return ctx.section("media", video ? "Video" : "Image", body);
}

function textAttr(
  ctx: SectionContext,
  node: Element,
  attribute: string,
  label: string
): HTMLElement {
  const field = createTextField({
    label,
    placeholder: attribute === "alt" ? "Describe the image" : "",
  });
  const reflect = (): void => {
    field.input.value = node.getAttribute(attribute) ?? "";
  };
  reflect();
  let skipBlur = false;
  const commit = (): void => {
    if (skipBlur) {
      skipBlur = false;
      return;
    }
    const value = field.input.value.trim();
    if (value === (node.getAttribute(attribute) ?? "")) {
      // Unchanged. Blur fires either way, and re-committing writes an attribute
      // edit — and a composer chip — for something the user only tabbed through.
      return;
    }
    ctx.onAttr(node, attribute, value === "" ? null : value);
  };
  field.input.addEventListener("blur", commit);
  field.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      commit();
      field.input.blur();
    } else if (e.key === "Escape") {
      /*
       * Every other field family in the panel reverts on Escape; this one had no
       * handler at all, so the key fell through to the registry and closed
       * whatever was open instead of undoing the typing. `skipBlur` is needed
       * because `blur()` would otherwise commit the value Escape just discarded —
       * the same guard `createNumField` and the CSS pane's rows already carry.
       */
      e.stopPropagation();
      reflect();
      skipBlur = true;
      field.input.blur();
    }
  });
  // Re-read on every refresh: an undo, or an agent edit that HMR brought back,
  // changes the attribute under a field that would otherwise keep showing — and
  // on the next blur re-commit — the old text.
  ctx.register({
    element: field.element,
    resync: reflect,
    setValue: () => undefined,
    virtual: true,
  });
  return labelled(label, field.element);
}

/** An attribute whose presence is the value (`autoplay`, `muted`). */
function booleanAttr(
  ctx: SectionContext,
  node: Element,
  attribute: string,
  label: string,
  values: EnumOption[]
): HTMLElement {
  const descriptor = attrDescriptor(attribute, label, values);
  const control = createSegmented(
    descriptor,
    node.hasAttribute(attribute) ? "on" : "off",
    () => {
      // No-op: `onSelect` owns the write.
    },
    {
      derive: () => (node.hasAttribute(attribute) ? "on" : "off"),
      onSelect: (value) =>
        ctx.onAttr(node, attribute, value === "on" ? "" : null),
      properties: [descriptor.cssProperty],
    }
  );
  ctx.register(control);
  return labelled(label, control.element);
}

/** An attribute with a value from a fixed set (`loading`, `decoding`). */
/**
 * A 9-preset position, plus a field for anything that is not one of the nine.
 *
 * The presets alone were a lossy control: `object-position: 20% 30%` matches no option,
 * so `createSelect` fell back to showing the raw string and *any* interaction snapped it
 * to a preset — a value the user could see but not keep. The field is the escape hatch,
 * and the presets stay because nine names are faster than typing two percentages.
 */
function positionRow(
  ctx: SectionContext,
  node: Element,
  property: string,
  label: string
): HTMLElement {
  const current = readValue(node, property).trim();
  const isPreset = POSITIONS.some((option) => option.value === current);
  const select = createSelect(
    enumDescriptor(property, property, label, POSITIONS, "50% 50%"),
    isPreset ? current : "",
    (_p, value) => {
      ctx.onChange(property, value);
      ctx.refresh();
    }
  );
  ctx.register({
    ...select,
    properties: [property],
    resync: () => {
      const next = readValue(node, property).trim();
      select.setValue(
        property,
        POSITIONS.some((o) => o.value === next) ? next : ""
      );
    },
    virtual: true,
  });

  const field = createTextField({
    label: `Custom ${label.toLowerCase()}`,
    placeholder: "20% 30%",
  });
  field.input.value = isPreset ? "" : current;
  const commit = (): void => {
    const value = field.input.value.trim();
    if (value && value !== readValue(node, property).trim()) {
      ctx.onChange(property, value);
    }
  };
  field.input.addEventListener("blur", commit);
  field.input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      field.input.blur();
    } else if ((e as KeyboardEvent).key === "Escape") {
      e.stopPropagation();
      field.input.value = isPreset ? "" : current;
      field.input.blur();
    }
  });
  ctx.register({
    element: field.element,
    resync: () => {
      const next = readValue(node, property).trim();
      field.input.value = POSITIONS.some((o) => o.value === next) ? "" : next;
    },
    setValue: () => undefined,
    virtual: true,
  });

  return labelled(
    label,
    el("div", { class: cls("group") }, [select.element, field.element])
  );
}

function attrToggle(
  ctx: SectionContext,
  node: Element,
  attribute: string,
  label: string,
  values: EnumOption[]
): HTMLElement {
  const descriptor = attrDescriptor(attribute, label, values);
  /*
   * The element's own value, or nothing.
   *
   * Not `values[0].value`: falling back to the first option made an `<img>` with
   * no `loading` attribute display **Lazy**, which is the opposite of the HTML
   * default and a claim about the markup that the markup does not make. An
   * unmatched value leaves the select showing no option, which is the honest
   * reading of "not set".
   */
  const control = createSelect(
    descriptor,
    node.getAttribute(attribute) ?? "",
    (_property, value) => ctx.onAttr(node, attribute, value)
  );
  // `--attr-*` is panel state, not CSS — see `ControlHandle.virtual`. Re-seeding
  // read `""` for it and blanked the dropdown on the first arrow key. `resync`
  // is how it still follows an external change to the attribute.
  ctx.register({
    ...control,
    resync: () =>
      control.setValue(
        descriptor.cssProperty,
        node.getAttribute(attribute) ?? ""
      ),
    virtual: true,
  });
  return labelled(label, control.element);
}
