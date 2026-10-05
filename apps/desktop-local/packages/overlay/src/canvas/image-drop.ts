/**
 * Drop an image onto the page to replace one that is already there.
 *
 * Two things can be dragged in: a file from Finder, and a thumbnail from the
 * Assets tab (which carries its URL under `ASSET_MIME`). While either is over
 * the page, the element under the pointer is outlined with a "Replace image"
 * badge when it is an image, and the drag is refused when it is not. On drop
 * the app selects that element and swaps its picture.
 *
 * Listens on the overlay's own window in capture phase, so it sees the drag
 * before the page does in the inline stage and over the frames' capture planes
 * on the canvas. Drags over the editor's own panels are left alone: the
 * composer and the Assets tab have drop targets of their own. Anything else
 * that would drop a file on the browser is refused, because a file dropped on a
 * tab replaces the editor with that file.
 */

import { isImageFile } from "../assets/client";
import { type ChromeLayer, hide, place, placeLabel } from "../chrome-layer";
import { cls, el } from "../dom";
import { isOwn } from "../edit-guard";
import { hasBackgroundImage, isRasterImage } from "../inspector/element-kind";
import { clipToSurface, localRect, type Surface } from "../surface";
import type { Point } from "./space";

/** The drag type an Assets thumbnail carries; the value is the image URL. */
export const ASSET_MIME = "application/x-weblab-asset";

/** What was dropped: a file to upload, or a project image by URL. */
export type ImageSource = { file: File } | { url: string };

/** What a drag is carrying, as far as can be told before the drop. */
export type DragKind = "asset" | "file" | "other";

export interface ImageDropDeps {
  /** False in view mode, where the page is the user's to drop on. */
  enabled: () => boolean;
  hitTest: (point: Point) => { node: Element; surface: Surface } | null;
  layer: ChromeLayer;
  onDrop: (node: Element, surface: Surface, source: ImageSource) => void;
  /** A drop that cannot be used, in words for a toast. */
  onRefuse: (message: string) => void;
  /** Where to listen. The overlay's own window. */
  win: Window;
}

/** An element whose picture the image editor can swap. */
export function isSwappableImage(node: Element): boolean {
  if (isRasterImage(node)) {
    // `<source srcset>` siblings decide what a `<picture>` paints, so a new
    // `src` would change nothing on screen; the Media section says so instead.
    return !hasResponsiveSources(node);
  }
  return hasBackgroundImage(node);
}

function hasResponsiveSources(img: Element): boolean {
  const parent = img.parentElement;
  return (
    parent?.tagName.toUpperCase() === "PICTURE" &&
    Array.from(parent.children).some(
      (child) =>
        child.tagName.toUpperCase() === "SOURCE" && child.hasAttribute("srcset")
    )
  );
}

/**
 * The image a drop at this node would replace.
 *
 * The node itself when it is one, else the nearest ancestor with a background
 * image, so text laid over a hero's photo still reaches the photo. Stops short
 * of `<body>`: a page-wide background is not what anyone means to replace by
 * dropping on a paragraph.
 */
export function imageTargetOf(node: Element | null): Element | null {
  if (!node) {
    return null;
  }
  if (isRasterImage(node)) {
    return isSwappableImage(node) ? node : null;
  }
  const body = node.ownerDocument?.body;
  for (let at: Element | null = node; at && at !== body; ) {
    if (at === node.ownerDocument?.documentElement) {
      break;
    }
    if (hasBackgroundImage(at)) {
      return at;
    }
    at = at.parentElement;
  }
  return null;
}

/** What a drag carries. `types` is readable during `dragover`; data is not. */
export function dragKind(dt: DataTransfer | null): DragKind | null {
  if (!dt) {
    return null;
  }
  const types = Array.from(dt.types ?? []);
  if (types.includes(ASSET_MIME)) {
    return "asset";
  }
  if (!types.includes("Files")) {
    return null;
  }
  // The MIME type of a dragged file is readable before the drop in Chrome and
  // Safari. When it is not, let the drop decide.
  const [first] = Array.from(dt.items ?? []).filter((i) => i.kind === "file");
  if (first?.type && !first.type.startsWith("image/")) {
    return "other";
  }
  return "file";
}

/** The first file of a drop, if it is an image. */
export function droppedImage(dt: DataTransfer | null): File | null {
  const file = dt?.files?.[0] ?? null;
  return file && isImageFile(file) ? file : null;
}

export function bindImageDrop(deps: ImageDropDeps): () => void {
  const box = el("div", { class: `${cls("layer")} ${cls("hover-box")}` });
  const label = el("div", {
    class: `${cls("layer")} ${cls("box-label")}`,
    text: "Replace image",
  });
  hide(box);
  hide(label);
  deps.layer.add(box, label);

  const clear = (): void => {
    hide(box);
    hide(label);
  };

  /** The image under the pointer, or null. */
  const targetAt = (
    e: DragEvent
  ): { node: Element; surface: Surface } | null => {
    const hit = deps.hitTest({ x: e.clientX, y: e.clientY });
    const node = imageTargetOf(hit?.node ?? null);
    return hit && node ? { node, surface: hit.surface } : null;
  };

  const onOver = (e: DragEvent): void => {
    const kind = dragKind(e.dataTransfer);
    if (!(kind && deps.enabled()) || isOwn(e.target)) {
      clear();
      return;
    }
    // Every file drag over the page is ours from here: accepted or refused,
    // never handed to the browser to open.
    e.preventDefault();
    e.stopPropagation();
    const target = kind === "other" ? null : targetAt(e);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = target ? "copy" : "none";
    }
    if (!target) {
      clear();
      return;
    }
    const rect = target.surface.toScreen(localRect(target.node));
    place(box, rect, clipToSurface(target.surface, rect));
    placeLabel(label, rect, target.surface.bounds()?.top ?? 0);
  };

  const onDrop = (e: DragEvent): void => {
    const kind = dragKind(e.dataTransfer);
    clear();
    if (!(kind && deps.enabled()) || isOwn(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = kind === "other" ? null : targetAt(e);
    if (!target) {
      return;
    }
    if (kind === "asset") {
      const url = e.dataTransfer?.getData(ASSET_MIME) ?? "";
      if (url) {
        deps.onDrop(target.node, target.surface, { url });
      }
      return;
    }
    const file = droppedImage(e.dataTransfer);
    if (!file) {
      deps.onRefuse("That file is not an image.");
      return;
    }
    deps.onDrop(target.node, target.surface, { file });
  };

  /**
   * A file dropped on the editor's own panels, where nothing took it.
   * Bubble phase, so the composer and the Assets tab answer first.
   */
  const onStray = (e: DragEvent): void => {
    if (e.defaultPrevented || dragKind(e.dataTransfer) === null) {
      return;
    }
    e.preventDefault();
    if (e.type === "dragover" && e.dataTransfer) {
      e.dataTransfer.dropEffect = "none";
    }
  };

  const onLeave = (e: DragEvent): void => {
    // Leaving the window: the pointer is gone, so is the outline.
    if (!e.relatedTarget) {
      clear();
    }
  };

  const { win } = deps;
  win.addEventListener("dragover", onOver, true);
  win.addEventListener("drop", onDrop, true);
  win.addEventListener("dragleave", onLeave, true);
  win.addEventListener("dragend", clear, true);
  win.addEventListener("dragover", onStray);
  win.addEventListener("drop", onStray);
  return () => {
    win.removeEventListener("dragover", onOver, true);
    win.removeEventListener("drop", onDrop, true);
    win.removeEventListener("dragleave", onLeave, true);
    win.removeEventListener("dragend", clear, true);
    win.removeEventListener("dragover", onStray);
    win.removeEventListener("drop", onStray);
    box.remove();
    label.remove();
  };
}
