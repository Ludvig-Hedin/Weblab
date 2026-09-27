/**
 * The image popover: which image, how it fills its box, and where it sits.
 *
 * One surface for the `<img>` source and for a background image layer, shaped
 * like the fill popover in a design tool: a preview you can click or drop a
 * file on, a Type switch (Fill, Fit, Stretch, and Tile for backgrounds), a
 * position pad, and the project's own images underneath.
 *
 * It never writes to the element itself. The section that opens it hands over
 * `read` and a setter per property, so an `<img>` goes through attributes and
 * `object-*` while a background layer goes through its entries in the parallel
 * `background-*` lists. After every write the popover reads back, so what it
 * shows is what the element now has rather than what was clicked.
 */
import {
  type AssetImage,
  isImageFile,
  listImages,
  NOT_AN_IMAGE,
  peekImages,
  uploadImage,
} from "../../assets/client";
import { cls, el } from "../../dom";
import { icon } from "../../icons";
import { type CloseReason, openPopover } from "../../popover-host";
import { toast } from "../../toast";
import type { Descriptor } from "../descriptors";
import { requestImageEditorReopen } from "../image-editor";
import { createTextField } from "./num-field";
import { createSegmented } from "./segmented";
import type { Gestures } from "./types";

export type ImageKind = "img" | "background";
export type ImageFit = "fill" | "fit" | "stretch" | "tile";

export interface ImageState {
  alt: string;
  /** `null` when the element uses a value the Type switch has no name for. */
  fit: ImageFit | null;
  position: string;
  src: string;
}

export interface ImageBinding {
  /**
   * What a relative `src` resolves against: the edited element's document.
   * In canvas mode that is a frame, not the shell this popover is drawn in.
   */
  baseUrl?: string;
  kind: ImageKind;
  read: () => ImageState;
  setAlt?: (alt: string) => void;
  setFit: (fit: ImageFit) => void;
  setPosition: (position: string) => void;
  setSrc: (url: string) => void;
}

export interface ImageAssets {
  listImages: (options?: { fresh?: boolean }) => Promise<AssetImage[]>;
  /** The last known list, shown at once while a fresh one loads. */
  peekImages?: () => AssetImage[] | null;
  uploadImage: (file: File) => Promise<AssetImage>;
}

export interface ImagePopoverOptions extends ImageBinding {
  /** Injected in tests; the real client otherwise. */
  assets?: ImageAssets;
  gestures?: Gestures;
  /**
   * Whether the element this popover edits is still the one being edited.
   * An upload that lands after the popover closed is still applied while this
   * holds (closing with Escape or a click outside is not changing your mind
   * about the file), and kept in the library only when it does not.
   */
  isCurrent?: () => boolean;
  /** `picked` is true when an image was applied while the popover was open. */
  onClose?: (reason: CloseReason, picked: boolean) => void;
  /**
   * Where to reopen if one of this popover's own writes rebuilds the panel.
   * See `requestImageEditorReopen`.
   */
  reopenKey?: string;
}

export interface ImagePopoverHandle {
  close: () => void;
  element: HTMLElement;
}

// -- Pure helpers --------------------------------------------------------------

const NEXT_IMAGE = /\/_next\/image\/?\?/;
const TRAILING_SLASHES = /\/+$/;
const WORDS = /\s+/;
const URL_FN = /^url\(\s*(['"]?)(.*?)\1\s*\)$/i;
const URL_QUOTE = /["\\]/g;
const QUERY_OR_HASH = /[?#]/;
/** More than this many project images earns a search field. */
const SEARCH_THRESHOLD = 12;

/** The real image behind a Next.js optimizer URL, or the input unchanged. */
export function decodeNextImage(src: string): string {
  if (!NEXT_IMAGE.test(src)) {
    return src;
  }
  try {
    const inner = new URL(src, "http://x").searchParams.get("url");
    return inner || src;
  } catch {
    return src;
  }
}

/** A file name to show for an image source: the last path segment, decoded. */
export function displayName(src: string): string {
  const value = decodeNextImage(src.trim());
  if (!value) {
    return "";
  }
  if (value.startsWith("data:")) {
    return "Embedded image";
  }
  const path = value.split(QUERY_OR_HASH)[0].replace(TRAILING_SLASHES, "");
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last) || value;
  } catch {
    return last || value;
  }
}

/**
 * A source as an absolute URL, resolved against the element's own document.
 *
 * The popover and the panel live in the shell document; in canvas mode the
 * image lives in a frame, whose base can differ. Unresolvable input is
 * returned unchanged.
 */
export function resolveSrc(src: string, base?: string): string {
  if (!src) {
    return src;
  }
  try {
    return new URL(src, base || globalThis.location?.href).href;
  } catch {
    return src;
  }
}

/** Compare two sources by what they point at, ignoring origin and the optimizer. */
export function sameImage(a: string, b: string, base?: string): boolean {
  const norm = (value: string): string => {
    const real = decodeNextImage(value.trim());
    try {
      const url = new URL(
        real,
        base || (globalThis.location?.href ?? "http://x/")
      );
      return decodeURIComponent(url.pathname);
    } catch {
      return real;
    }
  };
  return Boolean(a && b) && norm(a) === norm(b);
}

/** The address inside a `url(...)` layer, or `""` for anything else. */
export function urlOfLayer(layer: string): string {
  const match = URL_FN.exec(layer.trim());
  return match ? match[2] : "";
}

/** A `url()` layer for an address, quoted so any URL survives. */
export function layerOfUrl(url: string): string {
  return `url("${url.replace(URL_QUOTE, "\\$&")}")`;
}

/** Which Type segment an element's current CSS amounts to, if any. */
export function fitFromCss(
  kind: ImageKind,
  css: { objectFit?: string; repeat?: string; size?: string }
): ImageFit | null {
  if (kind === "img") {
    const map: Record<string, ImageFit> = {
      contain: "fit",
      cover: "fill",
      fill: "stretch",
    };
    return map[(css.objectFit ?? "").trim()] ?? null;
  }
  const size = (css.size ?? "").trim();
  const repeat = (css.repeat ?? "").trim();
  if (size === "cover") {
    return "fill";
  }
  if (size === "contain") {
    return "fit";
  }
  if (size === "100% 100%") {
    return "stretch";
  }
  const auto = size === "auto" || size === "auto auto" || size === "";
  if (auto && (repeat === "repeat" || repeat === "repeat repeat")) {
    return "tile";
  }
  return null;
}

/** The declarations one Type choice writes, per kind. */
export function fitCss(kind: ImageKind, fit: ImageFit): [string, string][] {
  if (kind === "img") {
    const map: Record<ImageFit, string> = {
      fill: "cover",
      fit: "contain",
      stretch: "fill",
      tile: "cover",
    };
    return [["object-fit", map[fit]]];
  }
  const size: Record<ImageFit, string> = {
    fill: "cover",
    fit: "contain",
    stretch: "100% 100%",
    tile: "auto",
  };
  return [
    ["background-size", size[fit]],
    ["background-repeat", fit === "tile" ? "repeat" : "no-repeat"],
  ];
}

/** The nine positions, in reading order, matching the Media section's presets. */
export const POSITION_PRESETS = [
  { label: "Top left", value: "0% 0%" },
  { label: "Top", value: "50% 0%" },
  { label: "Top right", value: "100% 0%" },
  { label: "Left", value: "0% 50%" },
  { label: "Center", value: "50% 50%" },
  { label: "Right", value: "100% 50%" },
  { label: "Bottom left", value: "0% 100%" },
  { label: "Bottom", value: "50% 100%" },
  { label: "Bottom right", value: "100% 100%" },
] as const;

const KEYWORD: Record<string, number> = {
  bottom: 100,
  center: 50,
  left: 0,
  right: 100,
  top: 0,
};

/** A position as two percentages. Anything not a percentage reads as centre. */
export function parsePosition(value: string): [number, number] {
  const words = value.trim().split(WORDS).filter(Boolean);
  if (
    words.length === 2 &&
    (words[0] === "top" ||
      words[0] === "bottom" ||
      words[1] === "left" ||
      words[1] === "right")
  ) {
    words.reverse();
  }
  const read = (word: string | undefined): number => {
    if (!word) {
      return 50;
    }
    if (word in KEYWORD) {
      return KEYWORD[word];
    }
    if (word.endsWith("%")) {
      const n = Number.parseFloat(word);
      return Number.isFinite(n) ? n : 50;
    }
    return 50;
  };
  return [read(words[0]), read(words[1])];
}

/** Where a contained image actually paints inside its frame. */
function containRect(
  frame: DOMRect,
  natural: { height: number; width: number }
): { height: number; left: number; top: number; width: number } {
  if (!(natural.width && natural.height && frame.width && frame.height)) {
    return {
      height: frame.height,
      left: frame.left,
      top: frame.top,
      width: frame.width,
    };
  }
  const scale = Math.min(
    frame.width / natural.width,
    frame.height / natural.height
  );
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    height,
    left: frame.left + (frame.width - width) / 2,
    top: frame.top + (frame.height - height) / 2,
    width,
  };
}

const clampPct = (n: number): number =>
  Math.round(Math.min(100, Math.max(0, n)));

// -- The popover ---------------------------------------------------------------

function fitDescriptor(kind: ImageKind): Descriptor {
  const values = [
    { label: "Fill", value: "fill" },
    { label: "Fit", value: "fit" },
    { label: "Stretch", value: "stretch" },
  ];
  if (kind === "background") {
    values.push({ label: "Tile", value: "tile" });
  }
  return {
    controlType: "segmented",
    // Panel state, not a real property — see `ControlHandle.virtual`.
    cssProperty: "--image-fit",
    defaultValue: "",
    enumValues: values,
    group: "appearance",
    key: "image-fit",
    label: "Image type",
  };
}

function popRow(label: string, control: HTMLElement): HTMLElement {
  return el("div", { class: cls("row") }, [
    el("span", { class: cls("row-label"), text: label }),
    control,
  ]);
}

export function openImagePopover(
  anchor: HTMLElement,
  opts: ImagePopoverOptions
): ImagePopoverHandle {
  const assets: ImageAssets = opts.assets ?? {
    listImages,
    peekImages,
    uploadImage,
  };
  const base = opts.baseUrl;
  let state = opts.read();
  let picked = false;
  let closed = false;
  let busy = false;
  let error = "";
  /** Depth of our own writes, so a close they cause can be told apart. */
  let writing = 0;
  let images: AssetImage[] | null = assets.peekImages?.() ?? null;
  let listError = "";
  let query = "";

  const write = (run: () => void): void => {
    writing += 1;
    try {
      run();
    } finally {
      writing -= 1;
    }
    if (!closed) {
      state = opts.read();
      sync();
    }
  };

  const apply = (url: string): void => {
    const value = url.trim();
    if (!value) {
      return;
    }
    picked = true;
    error = "";
    write(() => opts.setSrc(value));
  };

  // -- Preview ---------------------------------------------------------------
  const file = el("input", {
    accept: "image/*",
    "aria-hidden": "true",
    class: cls("img-file"),
    tabindex: "-1",
    type: "file",
  }) as HTMLInputElement;
  const chooseFile = (): void => {
    if (!busy) {
      file.click();
    }
  };

  const previewImg = el("img", {
    alt: "",
    class: cls("img-preview-img"),
    decoding: "async",
  }) as HTMLImageElement;
  const empty = el("span", { class: cls("img-preview-empty") }, [
    icon("image", "md"),
    el("span", { text: "Choose an image" }),
  ]);
  const hit = el("button", {
    class: cls("img-preview-hit"),
    onClick: chooseFile,
    type: "button",
  });
  const focal = el("span", { "aria-hidden": "true", class: cls("img-focal") });
  const status = el("span", {
    "aria-live": "polite",
    class: cls("img-preview-status"),
  });
  const preview = el("div", { class: cls("img-preview") }, [
    previewImg,
    empty,
    hit,
    focal,
    status,
  ]);
  previewImg.addEventListener("load", () => syncFocal());

  const name = el("div", { class: cls("img-name") });
  const errorLine = el("div", {
    "aria-live": "polite",
    class: cls("img-error"),
  });

  const upload = async (chosen: File | undefined): Promise<void> => {
    if (!chosen || busy) {
      return;
    }
    if (!isImageFile(chosen)) {
      error = NOT_AN_IMAGE;
      sync();
      return;
    }
    busy = true;
    error = "";
    sync();
    try {
      const asset = await assets.uploadImage(chosen);
      if (closed) {
        // Closing the popover is not taking the file back. Apply it while the
        // same element is still being edited; otherwise keep it in the library.
        if (opts.isCurrent?.() ?? false) {
          opts.setSrc(asset.url);
        } else {
          toast("Saved to your image library.");
        }
        return;
      }
      apply(asset.url);
      loadImages();
    } catch (err) {
      error =
        err instanceof Error ? err.message : "The upload did not go through.";
    } finally {
      busy = false;
      if (!closed) {
        sync();
      }
    }
  };
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    upload(chosen);
  });

  // -- Focal point -------------------------------------------------------------
  /*
   * Dragging the dot writes the position live, as one undo step: the gesture
   * bracket turns every pointermove's write into a single history batch, the
   * way the gradient editor's stop drag does.
   */
  focal.addEventListener("pointerdown", (e) => {
    if (state.fit !== "fill" || !state.src) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const frame = preview.getBoundingClientRect();
    const box = containRect(frame, {
      height: previewImg.naturalHeight,
      width: previewImg.naturalWidth,
    });
    let last = state.position;
    const move = (ev: PointerEvent): void => {
      if (!(box.width && box.height)) {
        return;
      }
      const x = clampPct(((ev.clientX - box.left) / box.width) * 100);
      const y = clampPct(((ev.clientY - box.top) / box.height) * 100);
      const next = `${x}% ${y}%`;
      if (next !== last) {
        last = next;
        write(() => opts.setPosition(next));
      }
    };
    const end = (): void => {
      focal.removeAttribute("data-drag");
      document.removeEventListener("pointermove", move);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        document.removeEventListener(type, end);
      }
      opts.gestures?.end?.();
    };
    opts.gestures?.begin?.();
    focal.setAttribute("data-drag", "");
    try {
      focal.setPointerCapture(e.pointerId);
    } catch {
      // No capture (a synthetic event); the document listeners still work.
    }
    document.addEventListener("pointermove", move);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      document.addEventListener(type, end);
    }
  });

  // -- Type --------------------------------------------------------------------
  const fitControl = createSegmented(
    fitDescriptor(opts.kind),
    state.fit ?? "",
    () => undefined,
    {
      onSelect: (value) => write(() => opts.setFit(value as ImageFit)),
    }
  );
  const typeRow = popRow("Type", fitControl.element);

  // -- Position ----------------------------------------------------------------
  const cells = POSITION_PRESETS.map((preset) =>
    el(
      "button",
      {
        "aria-label": preset.label,
        "aria-pressed": "false",
        class: cls("img-pos-cell"),
        "data-tip": preset.label,
        onClick: () => write(() => opts.setPosition(preset.value)),
        type: "button",
      },
      [el("span", { class: cls("img-pos-dot") })]
    )
  );
  const pad = el(
    "div",
    { "aria-label": "Position", class: cls("img-pos"), role: "group" },
    cells
  );
  const positionRow = popRow("Position", pad);

  // -- Alt text ----------------------------------------------------------------
  let altRow: HTMLElement | null = null;
  let altInput: HTMLInputElement | null = null;
  const { setAlt } = opts;
  if (opts.kind === "img" && setAlt) {
    const field = createTextField({
      label: "Alt text",
      placeholder: "Describe the image",
    });
    const { input } = field;
    altInput = input;
    let skipBlur = false;
    const commit = (): void => {
      if (skipBlur) {
        skipBlur = false;
        return;
      }
      const value = input.value.trim();
      if (value !== state.alt) {
        write(() => setAlt(value));
      }
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        input.value = state.alt;
        skipBlur = true;
        input.blur();
      }
    });
    altRow = popRow("Alt text", field.element);
  }

  // -- Project images ----------------------------------------------------------
  const libraryHead = el("div", {
    class: cls("img-lib-head"),
    text: "Project images",
  });
  const searchField = createTextField({
    glyph: "search",
    label: "Search images",
    placeholder: "Search",
  });
  searchField.element.classList.add(cls("img-search"));
  searchField.input.addEventListener("input", () => {
    query = searchField.input.value.trim().toLowerCase();
    renderGrid();
  });
  searchField.input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && searchField.input.value) {
      e.stopPropagation();
      searchField.input.value = "";
      query = "";
      renderGrid();
    }
  });
  const grid = el("div", { class: cls("img-grid") });
  const gridNote = el("div", { class: cls("img-note") });

  const addTile = (): HTMLElement =>
    el(
      "button",
      {
        "aria-label": "Upload an image",
        class: `${cls("img-tile")} ${cls("img-tile-add")}`,
        "data-tip": "Upload an image",
        onClick: chooseFile,
        type: "button",
      },
      [icon("plus", "sm")]
    );

  function renderGrid(): void {
    gridNote.replaceChildren();
    searchField.element.hidden = !(images && images.length > SEARCH_THRESHOLD);
    if (listError) {
      grid.replaceChildren(addTile());
      gridNote.append(
        el("span", { text: listError }),
        el("button", {
          class: cls("img-link"),
          onClick: () => loadImages(),
          text: "Try again",
          type: "button",
        })
      );
      return;
    }
    if (!images) {
      grid.replaceChildren(addTile());
      gridNote.textContent = "Loading images…";
      return;
    }
    if (!images.length) {
      grid.replaceChildren(addTile());
      gridNote.textContent =
        "No images in public/ yet. Drop one here or click +.";
      return;
    }
    const shown = query
      ? images.filter((image) => image.name.toLowerCase().includes(query))
      : images;
    grid.replaceChildren(
      addTile(),
      ...shown.map((image) => {
        const on = sameImage(image.url, state.src, base);
        const tile = el(
          "button",
          {
            "aria-label": image.name,
            "aria-pressed": String(on),
            class: cls("img-tile"),
            "data-tip": image.name,
            "data-url": image.url,
            onClick: () => apply(image.url),
            type: "button",
          },
          [
            el("img", {
              alt: "",
              decoding: "async",
              loading: "lazy",
              src: resolveSrc(image.url, base),
            }),
          ]
        );
        return tile;
      })
    );
    if (query && !shown.length) {
      gridNote.textContent = "No images match.";
    }
  }

  /** Same images, same order, same files: nothing to repaint. */
  const sameList = (a: AssetImage[] | null, b: AssetImage[]): boolean =>
    a !== null &&
    a.length === b.length &&
    a.every(
      (image, i) => image.url === b[i].url && image.modified === b[i].modified
    );

  /** Always asks the server again; whatever was cached is already on screen. */
  function loadImages(): void {
    listError = "";
    const request = assets.listImages({ fresh: true });
    request.then(
      (list) => {
        if (sameList(images, list)) {
          return;
        }
        images = list;
        if (!closed) {
          renderGrid();
          handle.reposition();
        }
      },
      (err: unknown) => {
        if (images) {
          // The cached list is still on screen and still true enough.
          return;
        }
        listError =
          err instanceof Error ? err.message : "Could not load the images.";
        if (!closed) {
          renderGrid();
        }
      }
    );
  }

  // -- URL ---------------------------------------------------------------------
  const urlSlot = el("div", { class: cls("img-url") });
  const showUrlButton = (): void => {
    urlSlot.replaceChildren(
      el("button", {
        class: cls("img-link"),
        onClick: showUrlField,
        text: "Use a URL",
        type: "button",
      })
    );
  };
  function showUrlField(): void {
    const field = createTextField({
      label: "Image URL",
      placeholder: "https://…",
    });
    const { input } = field;
    input.value = state.src;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (input.value.trim() && input.value.trim() !== state.src) {
          apply(input.value);
        }
      } else if (e.key === "Escape") {
        e.stopPropagation();
        showUrlButton();
      }
    });
    urlSlot.replaceChildren(field.element);
    input.focus();
    input.select();
  }
  showUrlButton();

  // -- Assemble ----------------------------------------------------------------
  const content = el("div", { class: `${cls("pop-form")} ${cls("img-pop")}` }, [
    file,
    preview,
    name,
    errorLine,
    typeRow,
    positionRow,
    altRow,
    libraryHead,
    searchField.element,
    grid,
    gridNote,
    urlSlot,
  ]);

  // Files dragged anywhere over the popover land on the preview.
  let dragDepth = 0;
  const hasFiles = (e: DragEvent): boolean =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");
  content.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    dragDepth += 1;
    preview.setAttribute("data-drop", "");
    sync();
  });
  content.addEventListener("dragover", (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    }
  });
  content.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) {
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      preview.removeAttribute("data-drop");
      sync();
    }
  });
  content.addEventListener("drop", (e) => {
    if (!hasFiles(e)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    preview.removeAttribute("data-drop");
    upload(e.dataTransfer?.files?.[0]);
  });

  function syncFocal(): void {
    const show = state.fit === "fill" && Boolean(state.src);
    focal.hidden = !show;
    if (!show) {
      return;
    }
    const [x, y] = parsePosition(state.position);
    const frame = preview.getBoundingClientRect();
    const box = containRect(frame, {
      height: previewImg.naturalHeight,
      width: previewImg.naturalWidth,
    });
    if (frame.width && frame.height) {
      focal.style.left = `${box.left - frame.left + (box.width * x) / 100}px`;
      focal.style.top = `${box.top - frame.top + (box.height * y) / 100}px`;
    } else {
      focal.style.left = `${x}%`;
      focal.style.top = `${y}%`;
    }
  }

  function syncPreview(): void {
    const has = Boolean(state.src);
    const resolved = resolveSrc(state.src, base);
    if (has && previewImg.getAttribute("src") !== resolved) {
      previewImg.src = resolved;
    }
    previewImg.hidden = !has;
    empty.hidden = has;
    const label = has ? "Replace image" : "Choose an image";
    hit.setAttribute("aria-label", label);
    hit.dataset.tip = has ? "Click to replace, or drop a file" : label;
    preview.toggleAttribute("data-busy", busy);
    let statusText = "";
    if (busy) {
      statusText = "Uploading…";
    } else if (preview.hasAttribute("data-drop")) {
      statusText = has ? "Drop to replace" : "Drop to add";
    }
    status.textContent = statusText;
    status.hidden = !statusText;

    const shown = displayName(state.src);
    name.textContent = shown || "No image";
    name.toggleAttribute("data-empty", !shown);
    if (has) {
      name.dataset.tip = decodeNextImage(state.src);
    } else {
      delete name.dataset.tip;
    }
    errorLine.textContent = error;
    errorLine.hidden = !error;
    syncFocal();
  }

  function syncControls(): void {
    fitControl.setValue("--image-fit", state.fit ?? "");
    positionRow.hidden = state.fit === "stretch";
    for (const [i, cell] of cells.entries()) {
      cell.setAttribute(
        "aria-pressed",
        String(state.position.trim() === POSITION_PRESETS[i].value)
      );
    }
    if (altInput && altInput !== document.activeElement) {
      altInput.value = state.alt;
    }
    for (const tile of grid.querySelectorAll<HTMLElement>("[data-url]")) {
      tile.setAttribute(
        "aria-pressed",
        String(sameImage(tile.dataset.url ?? "", state.src, base))
      );
    }
  }

  function sync(): void {
    syncPreview();
    syncControls();
  }

  // Opened from the keyboard (or a click, which focuses the anchor too), the
  // next key should act inside the popover rather than back in the panel.
  const openedFromAnchor = document.activeElement === anchor;
  const handle = openPopover({
    anchor,
    className: "pop-img",
    content,
    onClose: (reason) => {
      closed = true;
      if (reason === "anchor-gone" && writing > 0 && opts.reopenKey) {
        requestImageEditorReopen(opts.reopenKey);
      }
      opts.onClose?.(reason, picked);
    },
    prefer: "below",
    title: "Image",
  });

  sync();
  renderGrid();
  loadImages();
  if (openedFromAnchor && content.isConnected) {
    hit.focus({ preventScroll: true });
  }

  return {
    close: () => handle.close(),
    element: content,
  };
}
