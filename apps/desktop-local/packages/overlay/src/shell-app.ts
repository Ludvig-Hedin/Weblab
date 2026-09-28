import {
  AIRSHIP_FRAME_NAME,
  AIRSHIP_MODE_PARAM,
  type AirshipWindowConfig,
  readSurfaceCookie,
} from "@airship/protocol";
import { AirshipApp, claimBoot, publishDestroy, type Stage } from "./app";
import { FrameChrome } from "./canvas/frame-chrome";
import {
  type Frame,
  FrameManager,
  type StoredFrame,
  shownHeight,
} from "./canvas/frames";
import { FramesPanel } from "./canvas/frames-panel";
import { Minimap } from "./canvas/minimap";
import {
  normalizePath,
  PagesPanel,
  type PagesPanelHooks,
} from "./canvas/pages-panel";
import {
  frameChain,
  frameToScreen,
  nestOffset,
  type Point,
  type Rect,
  unionRects,
  type Viewport,
} from "./canvas/space";
import { CanvasViewport, type SafeInset } from "./canvas/viewport";
import {
  axes,
  type FrameWheelRoute,
  pixelDelta,
  routeWheel,
  type WheelLike,
  type WheelRouteCtx,
} from "./canvas/wheel";
import { ChromeLayer } from "./chrome-layer";
import { cls, el, PREFIX } from "./dom";
import type { FrameAgent, FrameHost, FrameWheel } from "./frame-agent";
import { keys } from "./keys/registry";
import type { Mods, Selection } from "./picker";
import { isElement } from "./realm";
import { injectStyles } from "./styles";
import { CanvasResolver, type SurfaceResolver } from "./surface";

/** How long after a page switch the canvas keeps fitting frames as they load. */
const PAGE_FIT_MS = 2500;

/** The narrowest the Inline page gets when the docks leave little room. */
const MIN_PAGE_WIDTH = 320;

/** The saved zoom per page. A bad entry is dropped, never trusted. */
function readPageViewports(storageKey: string): Map<string, Viewport> {
  const out = new Map<string, Viewport>();
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    for (const [path, vp] of Object.entries(raw ?? {})) {
      const v = vp as Partial<Viewport> | null;
      if (
        typeof v?.x === "number" &&
        typeof v.y === "number" &&
        typeof v.scale === "number"
      ) {
        out.set(path, { scale: v.scale, x: v.x, y: v.y });
      }
    }
  } catch {
    // Unreadable or private mode: start with none remembered.
  }
  return out;
}

/**
 * The canvas stage: a pan/zoom surface holding device frames, each a live copy
 * of the app.
 *
 * This document contains none of the user's code — the proxy serves a bare shell
 * here (see `packages/server/src/shell.ts`) and the app runs one realm down, in
 * the frames. Everything the editor does to those frames goes through `Surface`,
 * so the controllers themselves are the same ones the inline overlay drives.
 */
class CanvasStage implements Stage {
  readonly layer = new ChromeLayer();
  readonly resolver: SurfaceResolver;
  /** Frames are inert in edit mode, so there is nothing to swallow. */
  readonly swallowPresses = false;

  private readonly canvas: CanvasViewport;
  private readonly frames: FrameManager;
  private readonly chrome: FrameChrome;
  private readonly minimap: Minimap;
  private readonly framesPanel: FramesPanel;
  private readonly pagesPanel: PagesPanel;
  private readonly listeners: (() => void)[] = [];
  /** Subscribers to the trailing edge of a pan/zoom — see `isGesturing`. */
  private readonly gestureEndListeners: (() => void)[] = [];
  private readonly transientHandListeners: ((on: boolean) => void)[] = [];
  /** Per frame id, one disposer per registered agent window — the frame's own
   * realm and any nested same-origin document's. Keyed two-deep so a nested
   * agent registering never tears down the root agent's subscriptions. */
  private readonly frameUnsubs = new Map<string, Map<Window, () => void>>();
  /** The site page the frames are on, as the lead frame reports it. */
  private page: string;
  /** The zoom each page was left at, so going back lands where you were. */
  private readonly pageViewports: Map<string, Viewport>;
  private readonly pageViewportsKey: string;
  /** Until when a new page's frames are fitted as they load; 0 when done. */
  private fitPageUntil = 0;
  private getSelection: (() => Selection | null) | null = null;
  /** Where a press inside a live frame goes. Set by `bindFramePress`. */
  private reportFramePress:
    | ((at: Point, mods: Mods, dbl: boolean) => void)
    | null = null;
  /** Where a finished frame move or resize is journalled. Set by
   * `bindFrameBoxChange`. */
  private reportFrameBox:
    | ((before: StoredFrame, after: StoredFrame) => void)
    | null = null;
  private editing = true;
  /**
   * The Inline view: one page pinned between the docks at 100%, as wide as the
   * gap, scrolling up and down. Same stage and frames as the canvas, so every
   * editing tool works the same; only the camera and the frame box are held.
   */
  private readonly pageView: boolean;
  /** Listeners the Inline view adds, taken off again in `destroy`. */
  private readonly pageUnbind: (() => void)[] = [];
  /** The Inline view's scroll bar, since the page has no scroll of its own. */
  private pageScroll: { bar: HTMLElement; thumb: HTMLElement } | null = null;
  /** What the open docks are covering. Written by the app on every toggle and
   * splitter drag; read by the viewport whenever it has to aim at the canvas. */
  private safeInset: SafeInset = { left: 0, right: 0 };
  /** A wheel gesture latched to the selected frame — see `scrollFrame`. */
  private frameGesture: {
    pending: Point;
    raf: number;
    route: FrameWheelRoute;
    timer: number;
  } | null = null;

  constructor(config: AirshipWindowConfig) {
    // One canvas per site, not per page. The address follows the page the
    // frames are on (so a reload stays there), and a key per path would hand
    // every page its own frame layout.
    const key = `${PREFIX}-canvas:/`;
    this.pageView = config.surface === "inline";
    // The Inline view keeps its own frame, so pinning it to the gap never
    // resizes or moves the frames you arranged on the canvas.
    const layout = this.pageView ? "page-" : "";
    this.page = normalizePath(
      new URL(config.pathname ?? "/", window.location.origin).pathname
    );
    this.pageViewportsKey = `${key}:pages`;
    this.pageViewports = readPageViewports(this.pageViewportsKey);
    this.canvas = new CanvasViewport({
      constrain: this.pageView ? (vp) => this.constrainPage(vp) : undefined,
      getContentRects: () => this.frames.worldRects(),
      getSafeInset: () => this.safeInset,
      getSelectionRect: () => this.selectionWorldRect(),
      offerWheelToFrame: (e, point, target) =>
        this.offerWheelToFrame(e, point, target),
      onChange: () => this.onViewportChange(),
      onGestureEnd: () => this.emitGestureEnd(),
      onTransientHand: (on) => {
        for (const cb of this.transientHandListeners) {
          cb(on);
        }
      },
      storageKey: `${key}:${layout}viewport`,
    });
    this.frames = new FrameManager({
      onBoxChange: (before, after) => this.reportFrameBox?.(before, after),
      onChanged: () => this.onFramesChanged(),
      onFrameReady: (frame, agent) => this.onFrameReady(frame, agent),
      pathname: config.pathname ?? "/",
      storageKey: `${key}:${layout}frames`,
      world: this.canvas.world,
    });
    this.minimap = new Minimap({
      frames: this.frames,
      viewport: this.canvas,
    });
    this.framesPanel = new FramesPanel({
      frames: this.frames,
      viewport: this.canvas,
    });
    this.pagesPanel = new PagesPanel({ frames: this.frames });
    this.chrome = new FrameChrome({
      frames: this.frames,
      inCanvas: (point) => this.canvas.contains(point),
      layer: this.layer,
      onChanged: () => this.onFramesChanged(),
      viewport: this.canvas,
    });
    this.resolver = new CanvasResolver(this.frames, this.canvas);
  }

  /**
   * A wheel that happened inside a frame, forwarded up by that frame's agent.
   *
   * In view mode the frame is interactive, so the wheel lands in the frame's own
   * document and the shell never sees it — which is why ⌘-wheel over a frame did
   * nothing at all. The agent hands it over here; the only work is mapping the
   * frame's coordinates into screen space, which is both what the zoom anchor
   * needs and what lets `routeWheel` answer in the one coordinate space it
   * accepts. Who owns the wheel is decided there, not here — see `wheel.ts`.
   *
   * The frame's scroll is synthesised, never left to the browser. Declining —
   * returning false so the uncancelled wheel scrolls the frame natively — was
   * tried first, for the OS momentum fling, and is what made a selected frame
   * randomly refuse to scroll: for an iframe under the canvas's scaled,
   * composited transform, Chrome's wheel hit test intermittently fails to find
   * the frame's scroller at all, and an *uncancelled wheel over a scrollable
   * document simply does nothing* until some unrelated style invalidation
   * inside the frame wakes it (which is why resizing or poking the frame
   * "fixed" it). Scrolling the routed target ourselves is deterministic in
   * every compositor state, and the fling survives regardless: macOS keeps
   * delivering the momentum events, exactly as the canvas pan relies on.
   */
  private onFrameWheel(win: Window, e: FrameWheel): boolean {
    const frame = this.frames.frameOfWindow(win);
    if (!frame) {
      return false;
    }
    // The point arrives in the agent's own client coordinates; `routeWheel`
    // takes shell screen space and maps back. Round-tripping it rather than
    // adding a second entry point is what stops the two routes disagreeing.
    const screen = this.frameScreenPoint(frame, win, {
      x: e.clientX,
      y: e.clientY,
    });
    // Frames may overlap, so route only when *this* frame is the selected one.
    // Without it, a wheel in an unselected frame sitting over the selected one
    // would pass the geometry test and scroll the wrong frame.
    const route =
      !this.editing && this.frames.active?.id === frame.id
        ? (this.latchedRoute(frame.id, e) ??
          routeWheel(e, screen, this.wheelCtx()))
        : null;
    if (route) {
      this.scrollFrame(route, e);
      return true;
    }
    return this.canvas.applyWheel(
      // The frame is not taking this one, so the intent is a canvas gesture;
      // suppress the frame branch in `applyWheel`, which would otherwise hand it
      // straight back.
      { ...e, altKey: true },
      screen
    );
  }

  /**
   * A wheel the *shell* received, offered to the selected frame before the
   * canvas takes it.
   *
   * Everything a frame is covered or edged by is chrome in this document — the
   * title, the size badge, the eight resize grips — and a frame that has not
   * loaded yet has no document of its own at all. Those wheels never reached
   * `onFrameWheel`, so they panned, one pixel from a gesture that scrolled.
   */
  private offerWheelToFrame(
    e: WheelLike,
    screen: Point,
    target: EventTarget | null
  ): boolean {
    // Edit mode always pans, including over a frame — see `applyWheel`.
    if (this.editing) {
      return false;
    }
    const { active } = this.frames;
    const route =
      (active && this.latchedRoute(active.id, e)) ??
      routeWheel(e, screen, {
        ...this.wheelCtx(),
        onOwnChrome: this.isOwnFrameChrome(target),
      });
    if (!route) {
      return false;
    }
    this.scrollFrame(route, e);
    // Deliberately no `markGesture`: no canvas gesture happened.
    return true;
  }

  /**
   * Apply an owned wheel to the frame — one routine for both entry points.
   *
   * Divided by the canvas scale for the same reason `FrameChrome.onDragMove`
   * divides its drag deltas: the gesture happens in screen pixels, but the
   * scroll target is laid out in the frame's own units. At 50% zoom a 120px
   * wheel tick has to scroll 240 frame pixels for the content to track the
   * fingers 1:1 on screen — applied raw, the scroll visibly lagged the gesture
   * by exactly the zoom factor.
   *
   * Beyond the arithmetic, this latches and coalesces, and both are why the
   * first version felt laggy. A trackpad delivers wheels faster than frames
   * paint, and answering each one from scratch meant a `getBoundingClientRect`
   * in the shell plus an `elementFromPoint` and a computed-style walk inside a
   * live React app — layout-forcing work, per event, before any pixel moved.
   * So: the first owned wheel routes and *latches* its target for the whole
   * gesture (the same rule native scrolling and the canvas's `isWheeling`
   * already follow — an owner does not change hands mid-fling), and deltas
   * accumulate to be flushed as one `scrollBy` per animation frame, which is
   * also one scroll event per paint for the app's own listeners instead of
   * five.
   */
  private scrollFrame(route: FrameWheelRoute, e: WheelLike): void {
    const { dx, dy } = axes(pixelDelta(e), e.shiftKey);
    let g = this.frameGesture;
    if (g?.route.frame.id !== route.frame.id) {
      this.dropFrameGesture();
      g = {
        pending: { x: 0, y: 0 },
        raf: 0,
        route,
        timer: 0,
      };
      this.frameGesture = g;
    }
    // Fractional deltas accumulate here rather than being rounded away one
    // 2px trackpad event at a time.
    const { scale } = this.canvas;
    g.pending.x += dx / scale;
    g.pending.y += dy / scale;
    if (!g.raf) {
      g.raf = requestAnimationFrame(() => this.flushFrameScroll());
    }
    // Same disarm window as the canvas's `markGesture`: the gesture is over
    // once the events stop, momentum included.
    clearTimeout(g.timer);
    g.timer = window.setTimeout(() => this.dropFrameGesture(), 120);
  }

  /**
   * The gesture's latched route, if this wheel still belongs to it. Mirrors
   * `routeWheel`'s first guard: zoom chords and the canvas's alt sentinel are
   * never part of a scroll gesture, and a latch held for a deselected frame is
   * dead — `frameGesture` outliving a selection change is the 120ms tail.
   */
  private latchedRoute(frameId: string, e: WheelLike): FrameWheelRoute | null {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return null;
    }
    const g = this.frameGesture;
    return g && g.route.frame.id === frameId ? g.route : null;
  }

  private flushFrameScroll(): void {
    const g = this.frameGesture;
    if (!g) {
      return;
    }
    g.raf = 0;
    const { x, y } = g.pending;
    g.pending = { x: 0, y: 0 };
    try {
      // "instant", not "auto". A native wheel scroll ignores the page's CSS
      // `scroll-behavior`; "auto" re-applies it, so an app declaring `smooth`
      // turned every flush into an eased animation — and each next flush
      // aborted the one before it mid-flight, silently discarding whatever
      // distance had not animated yet. A fast gesture lost more than half its
      // travel that way, which read as the scroll being "slow".
      g.route.target.scrollBy({ behavior: "instant", left: x, top: y });
    } catch {
      // The frame reloaded or was removed mid-gesture; its realm is gone.
      this.dropFrameGesture();
    }
  }

  private dropFrameGesture(): void {
    const g = this.frameGesture;
    if (!g) {
      return;
    }
    cancelAnimationFrame(g.raf);
    clearTimeout(g.timer);
    this.frameGesture = null;
  }

  /**
   * Is this node the *selected* frame's own furniture? Read off `data-frame`
   * rather than geometry, because the title is drawn above the frame it names
   * and a grip straddles its edge — see `FrameChrome.render`.
   */
  private isOwnFrameChrome(target: EventTarget | null): boolean {
    const { active } = this.frames;
    if (!(active && isElement(target))) {
      return false;
    }
    const box = target.closest(`.${cls("fc")}`);
    return box?.getAttribute("data-frame") === active.id;
  }

  private wheelCtx(): WheelRouteCtx {
    return {
      activeFrame: this.frames.active,
      gesturing: this.canvas.isWheeling,
      scale: this.canvas.scale,
    };
  }

  /** `F` opens the canvas's own add-frame menu — the `+` button's shortcut. */
  addFrame(): void {
    if (this.pageView) {
      return;
    }
    this.chrome.openAddMenu();
  }

  /** The bar's view-mode slot for the selected frame's verbs. */
  mountFrameTools(host: HTMLElement): void {
    if (this.pageView) {
      return;
    }
    this.chrome.mountFrameTools(host);
  }

  /** The left dock's view-mode body. */
  mountFramesPanel(host: HTMLElement): void {
    host.append(this.framesPanel.element);
    this.framesPanel.render();
  }

  /** The left dock's Pages tab. */
  mountPagesPanel(host: HTMLElement): void {
    host.append(this.pagesPanel.element);
    this.pagesPanel.render();
  }

  renderPages(): void {
    this.pagesPanel.render();
  }

  revealSelection(): void {
    this.canvas.revealSelection();
  }

  setPagesHooks(hooks: PagesPanelHooks): void {
    this.pagesPanel.setHooks(hooks);
  }

  /** The bottom-right corner. */
  mountMinimap(host: HTMLElement): void {
    this.minimap.mount(host);
  }

  bindFramePress(report: (at: Point, mods: Mods, dbl: boolean) => void): void {
    this.reportFramePress = report;
  }

  bindFrameBoxChange(
    report: (before: StoredFrame, after: StoredFrame) => void
  ): void {
    this.reportFrameBox = report;
  }

  setFrameBox(box: StoredFrame): void {
    this.frames.setBox(box);
  }

  /**
   * A node is being edited in place — make its frame live, and arm that frame's
   * own press guard so the app underneath still cannot act.
   *
   * The two halves are inseparable: the first is what makes a caret placeable,
   * the second is what replaces the guarantee the capture plane was giving.
   * Shipping one without the other would either leave the caret unreachable or
   * hand the app back its clicks.
   */
  setTextOwner(node: Element | null): void {
    const frame = node ? this.frames.frameOf(node) : null;
    this.frames.setTextFrame(frame);
    // Every agent of the text frame, not just the root's: a text edit inside
    // a nested document must be guarded in the realm the caret lives in.
    for (const f of this.frames.all) {
      const on = f === frame;
      f.agent?.setTextGuard(on);
      for (const agent of f.agents.values()) {
        agent.setTextGuard(on);
      }
    }
  }

  mount(tools: HTMLElement): void {
    const host = window as unknown as FrameHost;
    host.__airshipOnFrameWheel = (win, e) => this.onFrameWheel(win, e);
    // A press inside a frame selects it, matching a press on its title. View
    // mode is the only route *and* the only mode this is allowed in: in edit
    // mode the frame is inert behind its capture plane so the event should never
    // arrive, but the guard is written down rather than left to that — frame
    // selection is view-mode-only now, and this is the second door into it.
    host.__airshipOnFramePress = (win) => {
      if (this.editing) {
        return;
      }
      const frame = this.frames.frameOfWindow(win);
      if (frame) {
        this.frames.setActive(frame.id);
      }
    };
    // The click-away route out of a frame that is live for a text edit. Mapped
    // frame → screen with exactly the transform `onFrameWheel` uses, so the
    // point lands back in the space `SelectionController.hitTest` expects and
    // both routes stay one code path.
    host.__airshipOnFrameTextPress = (win, e) => {
      const frame = this.frames.frameOfWindow(win);
      if (!frame) {
        return;
      }
      this.reportFramePress?.(
        this.frameScreenPoint(frame, win, { x: e.clientX, y: e.clientY }),
        { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey },
        e.dbl
      );
    };
    document.body.append(this.canvas.element);
    this.layer.mount(document.body);
    if (this.pageView) {
      this.mountPage();
      return;
    }
    this.chrome.mount(tools);

    // Read the saved viewport *before* touching frames. Adding a frame fires
    // `onChanged`, which persists the layout — and the viewport along with it —
    // so asking afterwards would always find the default `{0,0,1}` this session
    // had just written and would never fit the canvas on a first run.
    const hadViewport = this.canvas.restore();
    if (!this.frames.restore()) {
      // First run: the two breakpoints worth seeing side by side. Anything more
      // opinionated would be guessing at a project we know nothing about.
      this.frames.add({ presetId: "desktop" });
      this.frames.add({ presetId: "iphone-16" });
    }
    if (!hadViewport) {
      this.fitOnceSized();
    }
    // The canvas is edit mode's surface only now (view mode shows one page on
    // its own, see `setEditing`), so frames stay inert behind their capture
    // planes and the frame furniture stays live for good.
    this.frames.setEditing(true);
    this.chrome.setEditing(false);
    this.relayout();
  }

  /**
   * The Inline view's half of `mount`: one frame, no frame furniture, no saved
   * camera. The camera is whatever `constrainPage` allows, which is the page
   * at 100% between the docks, scrolled somewhere between its top and bottom.
   */
  private mountPage(): void {
    if (!this.frames.restore()) {
      this.frames.add({ presetId: "desktop", x: 0, y: 0 });
    }
    for (const extra of this.frames.all.slice(1)) {
      this.frames.remove(extra.id);
    }
    this.frames.setEditing(true);
    this.mountPageScroll();
    const relayout = (): void => this.layoutPage();
    window.addEventListener("resize", relayout);
    document.addEventListener("visibilitychange", relayout);
    this.pageUnbind.push(() => {
      window.removeEventListener("resize", relayout);
      document.removeEventListener("visibilitychange", relayout);
    });
    this.layoutPage();
    this.relayout();
  }

  /** The screen x range the Inline page fills: between the docked panels. */
  private pageSpan(): { left: number; width: number } {
    const { gutter = 0, left, right } = this.safeInset;
    const start = left > 0 ? left - gutter : 0;
    const end = right > 0 ? right - gutter : 0;
    const { width } = this.canvas.rect;
    return {
      left: start,
      width: Math.max(MIN_PAGE_WIDTH, width - start - end),
    };
  }

  /**
   * Size the Inline page to the gap: as wide as the room between the docks and
   * one window tall, so the site lays itself out for that width the way a
   * browser window of that size would. Dragging a dock resizes the page; it
   * never scales it.
   */
  private layoutPage(): void {
    const [frame] = this.frames.all;
    const { height } = this.canvas.rect;
    if (!frame || height < 1) {
      return;
    }
    const { width } = this.pageSpan();
    if (frame.x !== 0 || frame.y !== 0) {
      this.frames.move(frame.id, 0, 0);
    }
    if (
      frame.width !== Math.round(width) ||
      frame.height !== Math.round(height)
    ) {
      this.frames.resize(frame.id, width, height);
    }
    this.canvas.set(this.canvas.viewport);
  }

  /** Hold the Inline camera at 100%, on the gap, within the page's height. */
  private constrainPage(vp: Viewport): Viewport {
    const [frame] = this.frames.all;
    if (!frame) {
      return vp;
    }
    const { height } = this.canvas.rect;
    const top = -frame.y;
    const bottom = Math.min(top, height - shownHeight(frame) - frame.y);
    return {
      scale: 1,
      x: this.pageSpan().left - frame.x,
      y: Math.min(top, Math.max(bottom, vp.y)),
    };
  }

  /**
   * A scroll bar for the Inline page. The page is drawn as tall as it is and
   * the camera moves over it, so nothing native shows how far down you are.
   * The thumb can be dragged; the wheel works as it does anywhere on the canvas.
   */
  private mountPageScroll(): void {
    const thumb = el("div", { class: cls("page-scroll-thumb") });
    // Marked as editor chrome, so a press on it never selects the page below.
    const bar = el("div", { class: `${cls("layer")} ${cls("page-scroll")}` }, [
      thumb,
    ]);
    thumb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startCamera = this.canvas.viewport.y;
      const [frame] = this.frames.all;
      const { height } = this.canvas.rect;
      const ratio = frame && height > 0 ? shownHeight(frame) / height : 1;
      const move = (ev: PointerEvent): void => {
        this.canvas.set({
          ...this.canvas.viewport,
          y: startCamera - (ev.clientY - startY) * ratio,
        });
      };
      const end = (): void => {
        thumb.removeEventListener("pointermove", move);
        thumb.removeEventListener("pointerup", end);
        thumb.removeEventListener("pointercancel", end);
        this.canvas.save();
      };
      thumb.addEventListener("pointermove", move);
      thumb.addEventListener("pointerup", end);
      thumb.addEventListener("pointercancel", end);
    });
    this.layer.add(bar);
    this.pageScroll = { bar, thumb };
  }

  private syncPageScroll(): void {
    const scroll = this.pageScroll;
    const [frame] = this.frames.all;
    if (!(scroll && frame)) {
      return;
    }
    const { height, width } = this.canvas.rect;
    const page = shownHeight(frame);
    const { left, width: span } = this.pageSpan();
    scroll.bar.style.right = `${Math.max(0, width - left - span)}px`;
    const scrolls = page > height + 1;
    scroll.bar.classList.toggle(cls("hidden"), !scrolls);
    if (!scrolls) {
      return;
    }
    const thumbHeight = Math.max(32, (height * height) / page);
    const travel = height - thumbHeight;
    const scrolled = -this.canvas.viewport.y - frame.y;
    const at = travel * (scrolled / (page - height));
    scroll.thumb.style.height = `${thumbHeight}px`;
    scroll.thumb.style.transform = `translateY(${at}px)`;
  }

  /**
   * The first-run fit needs a real, visible window. A host that loads the
   * editor hidden (the Weblab app does, to avoid a blank flash) reports a
   * hidden document with no layout yet, and a fit taken then lands at the
   * minimum zoom in a corner — and is saved as this project's viewport.
   */
  private fitOnceSized(): void {
    const sized = (): boolean =>
      document.visibilityState === "visible" &&
      window.innerWidth > 200 &&
      window.innerHeight > 200;
    if (sized()) {
      this.canvas.zoomToFit();
      return;
    }
    const retry = (): void => {
      if (!sized()) {
        return;
      }
      window.removeEventListener("resize", retry);
      document.removeEventListener("visibilitychange", retry);
      requestAnimationFrame(() => this.canvas.zoomToFit());
    };
    window.addEventListener("resize", retry);
    document.addEventListener("visibilitychange", retry);
  }

  bindSelection(get: () => Selection | null): void {
    this.getSelection = get;
  }

  /**
   * Wheel momentum counts, not just the pointer drag.
   *
   * This used to report `isPanning` alone, so the moment a trackpad flick lifted
   * the fingers hover work resumed — while the canvas was still gliding. Every
   * `mousemove` arriving during the deceleration hit-tested into a frame that
   * was moving under it, which is the strobe this flag exists to prevent.
   */
  isGesturing(): boolean {
    return this.canvas.isPanning || this.canvas.isWheeling;
  }

  onLayoutChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  onGestureEnd(cb: () => void): void {
    this.gestureEndListeners.push(cb);
  }

  setSafeInset(inset: SafeInset): void {
    this.safeInset = inset;
    if (this.pageView) {
      this.layoutPage();
    }
  }

  /** Space or the middle button has the Hand out, or has put it away. */
  onTransientHand(cb: (on: boolean) => void): void {
    this.transientHandListeners.push(cb);
  }

  setHandTool(on: boolean): void {
    this.canvas.setHandTool(on);
  }

  setLive(on: boolean): void {
    this.frames.setLive(on);
  }

  reveal(node: Element): void {
    const win = node.ownerDocument.defaultView;
    const frame = win ? this.frames.frameOfWindow(win) : null;
    const agent = win ? frame?.agents.get(win) : undefined;
    try {
      agent?.reveal?.(node);
    } catch {
      // The realm died mid-call (a reload). Nothing to reveal.
    }
  }

  /**
   * View mode is not the canvas. It shows one page on its own, filling the
   * window like the real site, in a fresh frame loaded at the selected (or
   * first) frame's current address. The canvas and its frames stay as they
   * were underneath, hidden, so going back to Edit is instant.
   */
  setEditing(on: boolean): void {
    this.editing = on;
    // A latched scroll must not survive into a mode where frames are inert.
    this.dropFrameGesture();
    if (on) {
      this.closeViewFrame();
    } else {
      this.openViewFrame();
    }
  }

  private viewFrame: HTMLIFrameElement | null = null;

  private openViewFrame(): void {
    this.closeViewFrame();
    const frame = this.frames.active ?? this.frames.all[0];
    if (!frame) {
      return;
    }
    let { src } = frame.iframe;
    try {
      src = frame.win?.location.href ?? src;
    } catch {
      // A realm mid-reload; the frame's own src is the same page.
    }
    // Client-side navigation can drop the frame marker from the address, and
    // the proxy needs it to serve the app rather than a second shell.
    const url = new URL(src, window.location.href);
    url.searchParams.set(AIRSHIP_MODE_PARAM, "frame");
    src = url.href;
    // Same-origin and named like a frame, so the proxy serves the app with only
    // the frame agent in it. The agent registers with the canvas and is ignored
    // there, since this iframe belongs to no frame.
    this.viewFrame = document.createElement("iframe");
    this.viewFrame.name = `${AIRSHIP_FRAME_NAME}view`;
    this.viewFrame.className = cls("view-frame");
    this.viewFrame.allow = "clipboard-read; clipboard-write; fullscreen";
    this.viewFrame.title = frame.name;
    this.viewFrame.src = src;
    document.body.append(this.viewFrame);
  }

  private closeViewFrame(): void {
    this.viewFrame?.remove();
    this.viewFrame = null;
  }

  relayout(): void {
    // The canvas is full-bleed, so this fence is the whole window; the docks
    // keep chrome out by painting over it, not by clipping it (see
    // `chrome-layer.ts`). Kept so the layer still tracks the viewport's bounds.
    this.layer.setClip(this.canvas.rect);
    this.frames.updateMounts(this.canvas.rect);
    this.chrome.render();
    this.notify();
  }

  /**
   * After an edit lands, every frame reloads itself over HMR — independently,
   * and on its own schedule. Each one re-registers its agent as it comes back
   * (see `onFrameReady`), which is what re-anchors the chrome; there is nothing
   * to do here but persist the layout, since the user has likely been
   * rearranging frames while waiting.
   */
  afterApply(): void {
    this.save();
  }

  /**
   * Release the canvas and everything hanging off it.
   *
   * The per-frame subscriptions go first: each one holds a listener on a
   * frame's own document (`keys.observe`) and a callback into this stage, and
   * both keep that frame's realm alive. `FrameManager.destroy` then takes the
   * iframes themselves, so the order matters — pruning after the frames are
   * gone would be pruning an empty list.
   */
  destroy(): void {
    this.closeViewFrame();
    for (const off of this.pageUnbind.splice(0)) {
      off();
    }
    this.pageScroll?.bar.remove();
    this.pageScroll = null;
    for (const byWindow of this.frameUnsubs.values()) {
      for (const off of byWindow.values()) {
        off();
      }
    }
    this.frameUnsubs.clear();
    this.listeners.length = 0;
    this.gestureEndListeners.length = 0;
    this.transientHandListeners.length = 0;
    this.chrome.destroy();
    this.framesPanel.destroy();
    this.minimap.destroy();
    this.frames.destroy();
    this.canvas.destroy();
    this.layer.destroy();
    const host = window as unknown as Partial<FrameHost>;
    host.__airshipOnFrameWheel = undefined;
    host.__airshipOnFramePress = undefined;
    host.__airshipOnFrameTextPress = undefined;
  }

  // -- Internals -------------------------------------------------------------

  private onViewportChange(): void {
    this.syncPageScroll();
    this.frames.updateMounts(this.canvas.rect);
    this.chrome.render();
    this.notify();
  }

  private onFramesChanged(): void {
    if (this.pageView) {
      // The page grew or shrank as it loaded: keep the camera inside it.
      this.canvas.set(this.canvas.viewport);
      this.syncPageScroll();
    }
    this.pruneFrameUnsubs();
    this.frames.updateMounts(this.canvas.rect);
    this.chrome.render();
    this.notify();
    this.save();
    // A new page's frames grow to its height as it loads.
    this.fitPageSoon();
  }

  /**
   * Drop the layout subscriptions of frames that are gone.
   *
   * `onFrameReady` writes one entry per frame and nothing ever removed them, so
   * a deleted frame left its unsubscriber in the map — and that closure holds
   * the frame's `FrameAgent`, which holds that frame's `window`. The realm the
   * delete was supposed to destroy stayed reachable for the rest of the
   * session, and with a cap of eight frames you can churn through a lot of
   * them.
   *
   * Calling the disposer rather than only forgetting it: the agent's own
   * listener list is in the frame's realm, and while that realm is being torn
   * down anyway it costs nothing to leave it tidy — and this same path runs for
   * a frame that was merely *replaced*, where the realm is very much alive.
   */
  private pruneFrameUnsubs(): void {
    const live = new Set(this.frames.all.map((f) => f.id));
    for (const [id, byWindow] of this.frameUnsubs) {
      if (!live.has(id)) {
        for (const off of byWindow.values()) {
          off();
        }
        this.frameUnsubs.delete(id);
      }
    }
  }

  /**
   * A point in an agent's viewport coordinates → shell screen space,
   * composing the nested chain when the agent's window sits below the frame's
   * own document. The one transform every forwarded frame event shares.
   */
  private frameScreenPoint(frame: Frame, win: Window, point: Point): Point {
    const chain = frame.win ? frameChain(win, frame.win) : null;
    const rect = frameToScreen(
      frame.el,
      { height: 0, left: point.x, top: point.y, width: 0 },
      this.canvas.scale,
      chain ? nestOffset(chain) : undefined
    );
    return { x: rect.left, y: rect.top };
  }

  /**
   * A frame published its agent — on first load, and again after every HMR full
   * reload, which rebuilds the frame's realm from scratch.
   *
   * Re-subscribing here rather than once at construction is the point: listeners
   * bound to the old realm died with it, and nothing else would tell us. Without
   * this, outlines would freeze in place the first time the user edited a file.
   */
  /**
   * Re-subscribe to a frame that has just loaded, or reloaded over HMR.
   *
   * Two subscriptions, disposed together. The layout notifications re-anchor
   * the chrome; `keys.observe` is what makes the editor's own shortcuts work at
   * all while focus is inside the frame.
   *
   * That second one had no caller for the life of the module, and the bug it
   * fixes is written in its own docstring: a keydown inside a same-origin
   * iframe never reaches the shell's `document`, so in view mode — the only
   * mode where a frame takes focus, since edit mode makes them
   * `pointer-events: none` — Escape, the zoom keys and everything else were
   * simply dead the moment you clicked into your own app. Which commands are
   * allowed through from there is the catalog's `inFrame` flag, not this
   * line's business: routing all of them would let `f` add a frame while
   * somebody filled in a form.
   *
   * Disposal-first, because this fires again on every reload with a brand-new
   * document, and `pruneFrameUnsubs` takes the rest when a frame goes away.
   */
  private onFrameReady(frame: Frame, agent: FrameAgent): void {
    let byWindow = this.frameUnsubs.get(frame.id);
    if (byWindow && agent.window === frame.win) {
      // The root realm was rebuilt; the nested realms died with it, so every
      // subscription for this frame goes together — a surviving disposer
      // would hold a dead realm alive, and a nested agent that reboots will
      // re-register on its own.
      for (const off of byWindow.values()) {
        off();
      }
      byWindow.clear();
    } else {
      byWindow?.get(agent.window)?.();
    }
    if (!byWindow) {
      byWindow = new Map();
      this.frameUnsubs.set(frame.id, byWindow);
    }
    // A page finished loading: its links may name pages not listed yet.
    this.pagesPanel.render();
    if (agent.window === frame.win) {
      this.onFramePage(frame);
    }
    const offLayout = agent.onLayoutChange(() => this.notify());
    // The agent's own document, not `frame.doc`: for a nested agent that is
    // the nested document, which is exactly where shortcuts would otherwise
    // die the moment focus lands in it.
    const doc = agent.window.document;
    const offKeys = doc ? keys.observe(doc) : null;
    byWindow.set(agent.window, () => {
      offLayout();
      offKeys?.();
    });
    this.notify();
  }

  /**
   * Everything that has to be re-read after the canvas moved or its frames
   * changed.
   *
   * The two view-mode surfaces are redrawn from here rather than subscribing
   * through `onLayoutChange` like the app's own chrome does, because the gate
   * belongs here: they are hidden in edit mode, this fires on every frame of
   * every pan, and a subscriber cannot see the mode. `setEditing` catches them
   * up on the way back.
   */
  private notify(): void {
    if (!this.editing) {
      this.minimap.render();
      this.framesPanel.render();
    }
    for (const cb of this.listeners) {
      cb();
    }
  }

  /**
   * A frame's root page loaded. When the lead frame (the selected one, else the
   * first) is on a new page, the canvas follows it: the address changes so a
   * reload opens this page, and the zoom is fitted to the new page's frames,
   * or put back where it was if you have been on this page before.
   */
  private onFramePage(frame: Frame): void {
    let location: Location | null = null;
    try {
      location = frame.win?.location ?? null;
    } catch {
      // A realm mid-reload; its successor registers too.
    }
    if (!location) {
      return;
    }
    const path = normalizePath(location.pathname);
    const lead = this.frames.active ?? this.frames.all[0];
    if (frame === lead) {
      this.syncAddress(location);
      if (path !== this.page) {
        this.switchPage(path);
        return;
      }
    }
    if (path === this.page) {
      this.fitPageSoon();
    }
  }

  private switchPage(path: string): void {
    this.pageViewports.set(this.page, { ...this.canvas.viewport });
    try {
      localStorage.setItem(
        this.pageViewportsKey,
        JSON.stringify(Object.fromEntries(this.pageViewports))
      );
    } catch {
      // Private mode: the zooms are still remembered until a reload.
    }
    this.page = path;
    if (this.pageView) {
      // A new page opens at its top, the way a browser does.
      this.canvas.set({ ...this.canvas.viewport, y: Number.MAX_SAFE_INTEGER });
      return;
    }
    const before = this.pageViewports.get(path);
    if (before) {
      this.fitPageUntil = 0;
      this.canvas.set(before);
      this.canvas.save();
      return;
    }
    this.fitPageUntil = performance.now() + PAGE_FIT_MS;
    this.fitPageSoon();
  }

  /** Fit the frames while a new page is still loading into them. */
  private fitPageSoon(): void {
    if (performance.now() >= this.fitPageUntil) {
      return;
    }
    requestAnimationFrame(() => {
      if (performance.now() < this.fitPageUntil) {
        this.fitPageTop();
      }
    });
  }

  /**
   * Fit every frame's width and show the top of the page. Each frame is as
   * tall as its whole page, so fitting the height too would shrink a long
   * page to a sliver nobody can read.
   */
  private fitPageTop(): void {
    const bounds = unionRects(this.frames.worldRects());
    const safe = this.canvas.visibleSafeRect;
    if (!bounds || safe.width <= 0) {
      return;
    }
    const screenful = bounds.width * (safe.height / safe.width);
    this.canvas.fitToRect({
      ...bounds,
      height: Math.min(bounds.height, screenful),
    });
    this.canvas.save();
  }

  /** Point the shell's own address at the frame's page, without navigating. */
  private syncAddress(location: Location): void {
    const url = new URL(location.href);
    url.searchParams.delete(AIRSHIP_MODE_PARAM);
    const next = `${url.pathname}${url.search}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }

  private emitGestureEnd(): void {
    // A pan or zoom of your own ends the fitting of a page that is loading.
    this.fitPageUntil = 0;
    for (const cb of this.gestureEndListeners) {
      cb();
    }
  }

  /**
   * The selection's rect in world space, for zoom-to-selection.
   *
   * The selection is measured in its frame's coordinates, so it has to be
   * offset by that frame's world position — the same node at the same CSS
   * position sits somewhere different on the canvas depending on which frame it
   * is in, which is the whole reason frames have coordinates.
   */
  private selectionWorldRect(): Rect | null {
    const sel = this.getSelection?.();
    const frame = this.frames.frameOf(sel?.node ?? null);
    if (!(sel && frame)) {
      return null;
    }
    return {
      height: sel.rect.height,
      left: frame.x + sel.rect.left,
      top: frame.y + sel.rect.top,
      width: sel.rect.width,
    };
  }

  private save(): void {
    this.frames.save();
    this.canvas.save();
  }
}

export function bootShell(config: AirshipWindowConfig): void {
  // Same claim the inline path takes, and from the same module, so the two
  // surfaces cannot both hold one page. This used to be an inline
  // `__airshipBooted` check that published a teardown hook but never ran the
  // previous one, so the shell leaked a whole overlay per bundle swap.
  if (!claimBoot()) {
    return;
  }
  document.documentElement.setAttribute(`data-${PREFIX}-shell`, "");
  injectStyles();
  // A server older than this bundle does not say which surface it served, so
  // the sticky choice is read here too.
  const surface = config.surface ?? readSurfaceCookie(document.cookie);
  const withSurface = { ...config, surface };
  const stage = new CanvasStage(withSurface);
  const app = new AirshipApp(withSurface, stage);
  app.mount();
  publishDestroy(() => app.destroy());
}
