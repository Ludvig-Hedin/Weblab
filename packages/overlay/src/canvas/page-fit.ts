/**
 * Show the whole page in a frame, the way a design tool shows an artboard.
 *
 * A frame used to be a fixed viewport: 1440 × 1024 of the page, with the rest
 * reachable only by selecting the frame and scrolling inside it. On a real
 * marketing site that meant a canvas of heroes — and on one with smooth
 * scrolling (Lenis and friends own the wheel and reset any scroll they did not
 * start), not even that.
 *
 * So the iframe grows to the page's height. The catch is that the iframe *is*
 * the viewport: grow it to 6000px and every `100vh` hero is 6000px too, which
 * grows the page, which grows the iframe. Two things break that loop:
 *
 * 1. **Viewport units are frozen.** Every `vh`/`svh`/`lvh`/`dvh` in the page's
 *    stylesheets is rewritten to pixels of the frame's *device* height, so a
 *    `min-height: 100svh` hero stays exactly one screen tall — the same as it
 *    renders in a browser window of that size.
 * 2. **The root is pinned.** `html { height: 100% }` resolves against the
 *    iframe, not the device, so the root is held at the device height and the
 *    page is measured by what overflows it. That is also what makes a
 *    `height: 100%; overflow: auto` app shell stay one screen tall and keep
 *    scrolling inside itself, exactly as it does for real.
 *
 * The authored values are kept, so the inspector still shows `100svh` and not
 * the pixels standing in for it — see `authoredValue`.
 *
 * Runs inside the frame's realm (booted by `frame-agent.ts`).
 */

/** Any viewport-height unit, with its number. `vmin`/`vmax` are left alone. */
const VH_UNIT = /(-?(?:\d+\.?\d*|\.\d+))(?:s|l|d)?vh\b/g;
const HAS_VH = /\d(?:s|l|d)?vh\b/;

/** Past this the page is almost certainly growing with the frame, not content. */
export const MAX_PAGE_HEIGHT = 24_000;

const ROOT_STYLE_ID = "__airship-page-fit";
const AUTHORED_KEY = "__airshipAuthored";

type Authored = WeakMap<CSSStyleDeclaration, Map<string, string>>;

/** `100svh` at a 900px device height is `900px`. Pure; exported for tests. */
export function freezeValue(value: string, viewportHeight: number): string {
  return value.replace(VH_UNIT, (_, n: string) => {
    const px = (Number(n) * viewportHeight) / 100;
    return `${Math.round(px * 100) / 100}px`;
  });
}

function authoredMap(win: Window): Authored {
  const host = win as unknown as Record<string, Authored | undefined>;
  let map = host[AUTHORED_KEY];
  if (!map) {
    map = new WeakMap();
    host[AUTHORED_KEY] = map;
  }
  return map;
}

/**
 * What the stylesheet actually said for this declaration, before a frozen
 * viewport unit replaced it. Safe on any declaration from any realm.
 */
export function authoredValue(
  style: CSSStyleDeclaration,
  property: string
): string {
  const live = style.getPropertyValue(property).trim();
  try {
    const win =
      style.parentRule?.parentStyleSheet?.ownerNode?.ownerDocument
        ?.defaultView ?? null;
    const map = win
      ? (win as unknown as Record<string, Authored | undefined>)[AUTHORED_KEY]
      : undefined;
    return map?.get(style)?.get(property) ?? live;
  } catch {
    return live;
  }
}

/** Walk every style rule, descending into @media, @supports, @layer and friends. */
function eachStyle(
  rules: CSSRuleList,
  visit: (style: CSSStyleDeclaration) => void
): void {
  for (const rule of Array.from(rules)) {
    const { style } = rule as CSSStyleRule;
    if (style) {
      visit(style);
    }
    const { cssRules: nested } = rule as CSSGroupingRule;
    if (nested) {
      eachStyle(nested, visit);
    }
  }
}

function freezeStyle(
  style: CSSStyleDeclaration,
  height: number,
  authored: Authored
): void {
  let originals = authored.get(style);
  if (!originals) {
    for (let i = 0; i < style.length; i += 1) {
      const property = style.item(i);
      const value = style.getPropertyValue(property);
      if (HAS_VH.test(value)) {
        originals ??= new Map();
        originals.set(property, value.trim());
      }
    }
    if (!originals) {
      return;
    }
    authored.set(style, originals);
  }
  for (const [property, value] of originals) {
    style.setProperty(
      property,
      freezeValue(value, height),
      style.getPropertyPriority(property)
    );
  }
}

/**
 * Sheets already frozen, and at what height and size. Re-walking every rule on
 * every DOM change would restyle the page each animation frame; a sheet is only
 * walked again when it gains rules or the device height changes. (A `<style>`
 * whose text changes gets a new sheet object, so HMR is a fresh entry.)
 */
const frozenSheets = new WeakMap<
  CSSStyleSheet,
  { height: number; rules: number }
>();

/** Rewrite viewport units in every readable stylesheet of `doc`. */
export function freezeViewportUnits(doc: Document, height: number): void {
  const win = doc.defaultView;
  if (!win) {
    return;
  }
  const authored = authoredMap(win);
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin (a font CDN, say). Nothing we could rewrite anyway.
      continue;
    }
    const seen = frozenSheets.get(sheet);
    if (seen && seen.height === height && seen.rules === rules.length) {
      continue;
    }
    eachStyle(rules, (style) => freezeStyle(style, height, authored));
    frozenSheets.set(sheet, { height, rules: rules.length });
  }
}

/**
 * The page's height with the root pinned to the device height: whatever the
 * body and its overflow reach, never less than one screen.
 */
export function measurePage(doc: Document, viewportHeight: number): number {
  const { body } = doc;
  if (!body) {
    return viewportHeight;
  }
  const win = doc.defaultView;
  const top = body.getBoundingClientRect().top + (win?.scrollY ?? 0);
  const margin = Number.parseFloat(
    win?.getComputedStyle(body).marginBottom ?? "0"
  );
  const bottom =
    top + Math.max(body.scrollHeight, body.offsetHeight) + (margin || 0);
  return Math.min(MAX_PAGE_HEIGHT, Math.max(viewportHeight, Math.ceil(bottom)));
}

function pinRoot(doc: Document, height: number): void {
  let style = doc.getElementById(ROOT_STYLE_ID);
  if (!style) {
    if (!doc.head) {
      return;
    }
    style = doc.createElement("style");
    style.id = ROOT_STYLE_ID;
    doc.head.append(style);
  }
  const text = `html:root { height: ${height}px !important; min-height: 0 !important; max-height: none !important; }`;
  // Only on change: rewriting it is a DOM mutation, which would schedule the
  // next measure, which would rewrite it — one restyle per animation frame.
  if (style.textContent !== text) {
    style.textContent = text;
  }
}

export interface PageFit {
  /** Change the device height the page is laid out for. */
  setViewportHeight: (height: number) => void;
  stop: () => void;
}

/**
 * Freeze, pin, then report the page height whenever it may have changed:
 * stylesheets arriving (Next injects CSS after boot, and again on HMR), the
 * DOM changing, images and fonts loading.
 */
export function startPageFit(
  win: Window,
  viewportHeight: number,
  onHeight: (height: number) => void
): PageFit {
  // The frame's own constructors: observers from another realm do not observe.
  const realm = win as Window & typeof globalThis;
  const doc = win.document;
  let height = viewportHeight;
  let last = -1;
  let scheduled = 0;
  const schedule = (): void => {
    if (!scheduled) {
      scheduled = win.requestAnimationFrame(apply);
    }
  };
  const sizes = new realm.ResizeObserver(schedule);

  const apply = (): void => {
    scheduled = 0;
    // Observing twice is a no-op, so new top-level sections join as they mount.
    if (doc.body) {
      sizes.observe(doc.body);
      for (const child of Array.from(doc.body.children)) {
        sizes.observe(child);
      }
    }
    freezeViewportUnits(doc, height);
    pinRoot(doc, height);
    const page = measurePage(doc, height);
    if (Math.abs(page - last) >= 1) {
      last = page;
      onHeight(page);
    }
  };

  const mutations = new realm.MutationObserver(schedule);
  mutations.observe(doc.documentElement, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  // Stylesheets and images finish loading without mutating anything; `load`
  // does not bubble, but it does pass the document on the way down.
  doc.addEventListener("load", schedule, true);
  win.addEventListener("load", schedule);
  doc.fonts?.addEventListener?.("loadingdone", schedule);
  apply();

  return {
    setViewportHeight(next) {
      if (next !== height) {
        height = next;
        schedule();
      }
    },
    stop() {
      mutations.disconnect();
      sizes.disconnect();
      doc.removeEventListener("load", schedule, true);
      win.removeEventListener("load", schedule);
      doc.fonts?.removeEventListener?.("loadingdone", schedule);
      if (scheduled) {
        win.cancelAnimationFrame(scheduled);
      }
    },
  };
}
