import { AIRSHIP_FRAME_NAME, AIRSHIP_MODE_PARAM } from "@airship/protocol";

/**
 * Stops a page moving on its own while it sits on the editing canvas.
 *
 * Carousels, rotating headlines and marquees advance on a timer. On the canvas
 * that means the slide you were about to click slides away, and the one you
 * selected is replaced under your outline. There is no general way to find
 * "the slider" in someone's code, so this works one level down, on the clock
 * every library shares:
 *
 * - Timers of a second or more are held. Autoplay delays are seconds long;
 *   the timers an app needs to render (debounces, microtask-ish zero delays,
 *   short transitions) are well under that, so they still run.
 * - Endless CSS and Web Animations (marquees, spinners, pulsing loops) are
 *   paused.
 * - Finite ones, like a page-load fade-in, jump straight to their end. Played
 *   on the canvas they looked broken: every frame loads the whole page at
 *   once, so every entrance ran at the same time, and they ran again on every
 *   reload. Ending them, rather than holding them, means content that animates
 *   in never gets stuck invisible. CSS animations and transitions are cut to
 *   a hundredth of a millisecond (not zero, so their end events still fire);
 *   Web Animations started from script are finished as they start.
 * - The page is told its visitor prefers reduced motion. Scroll reveals driven
 *   from script (GSAP, Lenis and friends) hide content until a scroll that
 *   never comes: the frame is as tall as the page and does not scroll. Sites
 *   that honour the setting skip those reveals and render content in place.
 *   Script (`matchMedia`) and stylesheets get the same answer, so CSS never
 *   hides what script decided not to reveal.
 *
 * It installs from the hook script, which runs in the document head before
 * any app code, so the very first autoplay timer is already caught. Only
 * canvas frames start frozen. The preview frame, the shell and the inline
 * overlay are never touched.
 */

/** Timers at or above this are treated as autoplay and held while frozen. */
const HOLD_MS = 1000;
/** How often endless animations are looked for while frozen. */
const SCAN_MS = 500;

type Callback = (...args: unknown[]) => void;

export interface MotionGate {
  setFrozen: (on: boolean) => void;
}

declare global {
  interface Window {
    __airshipMotion?: MotionGate;
  }
}

/** A canvas frame, judged the way the proxy and `index.ts` judge it. */
function isCanvasFrame(win: Window): boolean {
  const { name } = win;
  if (name.startsWith(AIRSHIP_FRAME_NAME)) {
    // The preview frame is named like a frame but plays normally.
    return !name.endsWith("view");
  }
  try {
    const mode = new URL(win.location.href).searchParams.get(
      AIRSHIP_MODE_PARAM
    );
    return mode === "frame" && win.parent !== win;
  } catch {
    return false;
  }
}

/** Instant CSS motion. Adopted, not a <style> tag, so hydration never sees it. */
const INSTANT_MOTION_CSS = `*, *::before, *::after {
  animation-delay: 0s !important; animation-duration: 0.01ms !important;
  transition-delay: 0s !important; transition-duration: 0.01ms !important;
}`;

/** `(prefers-reduced-motion)`, with or without a value. */
const REDUCED_MOTION_QUERY =
  /\(\s*prefers-reduced-motion\s*(?::\s*(reduce|no-preference)\s*)?\)/gi;

/**
 * Rewrite a media query as if the visitor asked for reduced motion. The
 * stand-ins are valid features that are always true or always false, so
 * `not (…)` and `and` still combine correctly. Pure; exported for tests.
 */
export function reducedMotionQuery(query: string): string {
  return query.replace(REDUCED_MOTION_QUERY, (_, value?: string) =>
    value?.toLowerCase() === "no-preference" ? "(width < 0)" : "(width >= 0)"
  );
}

/**
 * Give the page's CSS the same answer script gets from `matchMedia`, so a
 * stylesheet never hides content that script has decided not to reveal. A
 * sheet is walked again only when it gains rules.
 */
function reduceMotionInSheets(
  doc: Document,
  walked: WeakMap<CSSStyleSheet, number>,
  rewritten: Map<MediaList, string>
): void {
  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const { media } = rule as CSSMediaRule;
      if (media && !rewritten.has(media)) {
        const text = media.mediaText;
        const next = reducedMotionQuery(text);
        if (next !== text) {
          rewritten.set(media, text);
          media.mediaText = next;
        }
      }
      const { cssRules: nested } = rule as CSSGroupingRule;
      if (nested) {
        visit(nested);
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets ?? [])) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin; not readable
    }
    if (walked.get(sheet) === rules.length) {
      continue;
    }
    walked.set(sheet, rules.length);
    visit(rules);
  }
}

function isEndless(animation: Animation): boolean {
  return animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY;
}

/**
 * Pause endless animations that are running, and remember which ones. Finite
 * ones are finished: nothing was paused, so there is nothing to resume.
 */
function settleAnimations(doc: Document, paused: Set<Animation>): void {
  if (typeof doc.getAnimations !== "function") {
    return;
  }
  for (const animation of doc.getAnimations()) {
    if (animation.playState !== "running") {
      continue;
    }
    if (isEndless(animation)) {
      animation.pause();
      paused.add(animation);
    } else {
      animation.finish();
    }
  }
}

/**
 * Cut CSS motion to an instant and finish script animations as they start.
 * Returns the undo. Anything the realm lacks (a test window) is skipped.
 */
function makeMotionInstant(win: Window): () => void {
  const undo: (() => void)[] = [];
  const { document: doc } = win;
  const Sheet = (win as unknown as { CSSStyleSheet?: typeof CSSStyleSheet })
    .CSSStyleSheet;
  if (Sheet && doc && "adoptedStyleSheets" in doc) {
    const sheet = new Sheet();
    sheet.replaceSync(INSTANT_MOTION_CSS);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    undo.push(() => {
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(
        (s) => s !== sheet
      );
    });
  }
  const proto = (win as unknown as { Element?: typeof Element }).Element
    ?.prototype;
  const realAnimate = proto?.animate;
  if (proto && realAnimate) {
    proto.animate = function animate(
      this: Element,
      ...args: Parameters<Element["animate"]>
    ): Animation {
      const animation = realAnimate.apply(this, args);
      if (!isEndless(animation)) {
        animation.finish();
      }
      return animation;
    };
    undo.push(() => {
      proto.animate = realAnimate;
    });
  }
  const realMatchMedia = win.matchMedia;
  if (typeof realMatchMedia === "function") {
    win.matchMedia = (query: string) =>
      realMatchMedia.call(win, reducedMotionQuery(String(query)));
    undo.push(() => {
      win.matchMedia = realMatchMedia;
    });
  }
  return () => {
    for (const run of undo) {
      run();
    }
  };
}

export function installMotionGate(win: Window = window): void {
  if (win.__airshipMotion || !isCanvasFrame(win)) {
    return;
  }
  const realSetTimeout = win.setTimeout.bind(win);
  const realSetInterval = win.setInterval.bind(win);
  const realClearInterval = win.clearInterval.bind(win);
  const realClearTimeout = win.clearTimeout.bind(win);

  let frozen = true;
  let scan: number | null = null;
  /** Only what this gate paused is resumed; the app's own pauses stay. */
  const paused = new Set<Animation>();
  /** Long timeouts that came due while frozen, by their timer id. */
  const held = new Map<number, () => void>();

  const delayOf = (ms: unknown): number => Number(ms) || 0;

  win.setTimeout = ((
    handler: TimerHandler,
    ms?: number,
    ...args: unknown[]
  ) => {
    if (typeof handler !== "function" || delayOf(ms) < HOLD_MS) {
      return realSetTimeout(handler, ms, ...args);
    }
    const fn = handler as Callback;
    const id: number = realSetTimeout(() => {
      if (frozen) {
        held.set(id, () => fn(...args));
        return;
      }
      fn(...args);
    }, ms);
    return id;
  }) as typeof win.setTimeout;

  win.clearTimeout = ((id?: number) => {
    if (id !== undefined) {
      held.delete(id);
    }
    realClearTimeout(id);
  }) as typeof win.clearTimeout;

  win.setInterval = ((
    handler: TimerHandler,
    ms?: number,
    ...args: unknown[]
  ) => {
    if (typeof handler !== "function" || delayOf(ms) < HOLD_MS) {
      return realSetInterval(handler, ms, ...args);
    }
    const fn = handler as Callback;
    // A tick missed while frozen is dropped, not queued: an interval that
    // caught up on unfreeze would fire a burst of slide changes at once.
    return realSetInterval(() => {
      if (!frozen) {
        fn(...args);
      }
    }, ms);
  }) as typeof win.setInterval;

  win.clearInterval = ((id?: number) => {
    realClearInterval(id);
  }) as typeof win.clearInterval;

  // From the first line of the head, so the page's own entrance never plays.
  let restoreMotion: (() => void) | null = makeMotionInstant(win);

  /** Media rules rewritten for reduced motion, with what they said before. */
  const rewritten = new Map<MediaList, string>();
  let walkedSheets = new WeakMap<CSSStyleSheet, number>();

  const settle = (): void => {
    settleAnimations(win.document, paused);
    reduceMotionInSheets(win.document, walkedSheets, rewritten);
  };

  const startScan = (): void => {
    if (!frozen || scan !== null) {
      return;
    }
    settle();
    scan = realSetInterval(settle, SCAN_MS);
  };

  win.__airshipMotion = {
    setFrozen(on) {
      if (on === frozen) {
        return;
      }
      frozen = on;
      if (on) {
        restoreMotion ??= makeMotionInstant(win);
        startScan();
        return;
      }
      restoreMotion?.();
      restoreMotion = null;
      for (const [media, text] of rewritten) {
        media.mediaText = text;
      }
      rewritten.clear();
      walkedSheets = new WeakMap();
      if (scan !== null) {
        realClearInterval(scan);
        scan = null;
      }
      for (const animation of paused) {
        animation.play();
      }
      paused.clear();
      const due = [...held.values()];
      held.clear();
      for (const run of due) {
        run();
      }
    },
  };

  if (win.document.readyState === "loading") {
    win.document.addEventListener("DOMContentLoaded", startScan, {
      once: true,
    });
  } else {
    startScan();
  }
}
