/*
 * The Frame tool: press F, drag on the page, get a box there.
 *
 * Figma and Framer draw a frame where you drag. A web page has no free
 * placement — every element lives in its parent's flow — so "where you drag"
 * means two things here: the element you start the drag on becomes the parent
 * (or, for a leaf like a heading, its parent, right after it), and the box goes
 * between the children at the point you started. The size you drag is the size
 * it gets.
 *
 * One box per press, then the tool puts itself down, the way Figma returns to
 * Move after you draw. Esc puts it down without drawing.
 */
import type { Point } from "./canvas/space";
import { isLeafTag } from "./structure-ops";
import type { Surface } from "./surface";

/** Below this much travel a press is a click, and a click draws the default. */
const CLICK_SLOP = 4;
/** What a click without a drag draws, as Figma does. */
export const DEFAULT_BOX = 100;

export interface DrawnBox {
  /** The child the box goes before, or null for the end of `parent`. */
  before: Element | null;
  height: number;
  parent: Element;
  surface: Surface;
  width: number;
}

export interface DrawToolDeps {
  /** Resolve a screen point to the page node under it. */
  hitTest: (point: Point) => { node: Element; surface: Surface } | null;
  /** A press on the editor's own panels and bar, which the tool leaves alone. */
  isChrome: (target: EventTarget | null) => boolean;
  /** The tool was put down, drawn or not — relight the button. */
  onChange: (armed: boolean) => void;
  onDraw: (box: DrawnBox) => void;
}

export class DrawTool {
  private armedState = false;
  private readonly deps: DrawToolDeps;
  private preview: HTMLElement | null = null;
  private start: Point | null = null;
  private target: { node: Element; surface: Surface } | null = null;

  constructor(deps: DrawToolDeps) {
    this.deps = deps;
  }

  get armed(): boolean {
    return this.armedState;
  }

  toggle(): void {
    if (this.armedState) {
      this.disarm();
    } else {
      this.arm();
    }
  }

  arm(): void {
    if (this.armedState) {
      return;
    }
    this.armedState = true;
    window.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("keydown", this.onKey, true);
    document.documentElement.style.cursor = "crosshair";
    this.deps.onChange(true);
  }

  disarm(): void {
    if (!this.armedState) {
      return;
    }
    this.armedState = false;
    window.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("keydown", this.onKey, true);
    this.endDrag();
    document.documentElement.style.cursor = "";
    this.deps.onChange(false);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.disarm();
    }
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.deps.isChrome(e.target)) {
      return;
    }
    const at = { x: e.clientX, y: e.clientY };
    const hit = this.deps.hitTest(at);
    if (!hit) {
      return;
    }
    // Ours from here on: the picker must not select, move or marquee.
    e.preventDefault();
    e.stopPropagation();
    this.start = at;
    this.target = hit;
    this.preview = document.createElement("div");
    Object.assign(this.preview.style, {
      background: "rgba(13, 153, 255, 0.08)",
      border: "1px solid #0d99ff",
      pointerEvents: "none",
      position: "fixed",
      zIndex: "2147483646",
    });
    // A class with the editor's prefix, so hit tests read straight through it.
    this.preview.className = "__airship-draw-preview";
    document.body.append(this.preview);
    this.paint(at);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
  };

  private readonly onMove = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.paint({ x: e.clientX, y: e.clientY });
  };

  private readonly onUp = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const { start, target } = this;
    this.endDrag();
    // The click that follows this pointerup would select whatever is under it.
    window.addEventListener("click", swallowOnce, {
      capture: true,
      once: true,
    });
    if (!(start && target)) {
      return;
    }
    const box = drawnBox(target, start, { x: e.clientX, y: e.clientY });
    this.disarm();
    this.deps.onDraw(box);
  };

  private paint(to: Point): void {
    const from = this.start;
    if (!(from && this.preview)) {
      return;
    }
    Object.assign(this.preview.style, {
      height: `${Math.abs(to.y - from.y)}px`,
      left: `${Math.min(from.x, to.x)}px`,
      top: `${Math.min(from.y, to.y)}px`,
      width: `${Math.abs(to.x - from.x)}px`,
    });
  }

  private endDrag(): void {
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    this.preview?.remove();
    this.preview = null;
    this.start = null;
    this.target = null;
  }
}

function swallowOnce(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

/** Where the box goes and how big it is, in the page's own pixels. */
export function drawnBox(
  hit: { node: Element; surface: Surface },
  from: Point,
  to: Point
): DrawnBox {
  const { node, surface } = hit;
  const a = surface.toLocal(from);
  const b = surface.toLocal(to);
  const dragged =
    Math.abs(to.x - from.x) > CLICK_SLOP ||
    Math.abs(to.y - from.y) > CLICK_SLOP;
  const width = dragged ? Math.round(Math.abs(b.x - a.x)) : DEFAULT_BOX;
  const height = dragged ? Math.round(Math.abs(b.y - a.y)) : DEFAULT_BOX;
  const tag = node.tagName.toLowerCase();
  const leaf = isLeafTag(tag) && node.parentElement;
  if (leaf || tag === "html") {
    const parent =
      tag === "html"
        ? (node.ownerDocument.body ?? node)
        : (node.parentElement as Element);
    return {
      before: tag === "html" ? null : node.nextElementSibling,
      height,
      parent,
      surface,
      width,
    };
  }
  return {
    before: childAfter(node, a, surface),
    height,
    parent: node,
    surface,
    width,
  };
}

/**
 * The first child that sits after `point` along the parent's flow — below it
 * in a column, to its right in a row.
 */
function childAfter(
  parent: Element,
  point: Point,
  surface: Surface
): Element | null {
  const style = surface.win.getComputedStyle(parent);
  const row =
    style.display.includes("flex") && style.flexDirection.startsWith("row");
  for (const child of parent.children) {
    const r = child.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      continue;
    }
    const mid = row ? r.left + r.width / 2 : r.top + r.height / 2;
    if ((row ? point.x : point.y) < mid) {
      return child;
    }
  }
  return null;
}
