/**
 * Bring a selected element into view inside its own page: the slide of a
 * carousel you picked in Layers, or an item scrolled out of a strip.
 *
 * Runs in the frame's realm (see `FrameAgent.reveal`). There is no way to find
 * "the slider" in any site's code, so this reads the shapes every slider has:
 *
 * 1. A scrolling strip. Scroll the element into view, which is all a
 *    scroll-snap carousel needs.
 * 2. A moving track of slides with dots. Find the slide the element is in,
 *    its index among its siblings, and a row of buttons with one per slide.
 *    Click the matching one, the way you would.
 * 3. A moving track with only arrows. Click "next" (or "previous") until the
 *    slide shows, with a hard cap.
 *
 * Every step is a no-op when the element is already visible, so this is safe
 * to run on every selection.
 */

/** A strip with more than this many "next" presses is not worth walking. */
const MAX_STEPS = 12;
/** Time for a slider to render one press before the next. */
const STEP_MS = 80;
const NEXT = /\b(next|forward)\b|›|→|»/i;
const PREV = /\b(prev|previous|back)\b|‹|←|«/i;

function isClipping(el: Element, win: Window): boolean {
  const style = win.getComputedStyle(el);
  return (
    style.overflowX !== "visible" ||
    style.overflowY !== "visible" ||
    style.overflow === "clip"
  );
}

/** The nearest ancestor that cuts its content off, or null. */
function clipOf(el: Element, win: Window): Element | null {
  let node = el.parentElement;
  while (node && node !== el.ownerDocument.body) {
    if (isClipping(node, win)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Hidden by a carousel: marked hidden itself, or mostly outside the box that
 * clips it. Only the element's own marks count; an icon's aria-hidden says
 * nothing about slides.
 */
export function isOffstage(el: Element, win: Window): boolean {
  if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("inert")) {
    return true;
  }
  const clip = clipOf(el, win);
  if (!clip) {
    return false;
  }
  const a = el.getBoundingClientRect();
  const b = clip.getBoundingClientRect();
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  // Mostly out of view counts as out: a slide peeking in by a few pixels is
  // still the one you cannot see.
  return overlapX < a.width / 2 || overlapY < a.height / 2;
}

/**
 * The hidden slide `el` sits in: an ancestor that is offstage while one of
 * its look-alike siblings is showing. That pair is what a carousel is; a row
 * of hidden icons, or a card cut off at the edge, has no showing twin.
 */
function slideOf(el: Element, win: Window): Element | null {
  const { body } = el.ownerDocument;
  let current: Element = el;
  let parent = current.parentElement;
  while (parent && parent !== body) {
    const alike = [...parent.children].filter(
      (s) => s.tagName === current.tagName
    );
    if (
      alike.length >= 2 &&
      isOffstage(current, win) &&
      alike.some((s) => s !== current && !isOffstage(s, win))
    ) {
      return current;
    }
    current = parent;
    parent = current.parentElement;
  }
  return null;
}

function buttonsNear(slide: Element): Element[] {
  // Controls sit beside the track, not in it, so look a few levels up.
  let root: Element | null = slide.parentElement;
  for (let i = 0; i < 4 && root?.parentElement; i += 1) {
    root = root.parentElement;
  }
  const track = slide.parentElement;
  return [
    ...(root ?? slide).querySelectorAll(
      "button, [role='button'], [role='tab'], a[href^='#']"
    ),
  ].filter((b) => !track?.contains(b));
}

function labelOf(el: Element): string {
  return `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
}

function click(el: Element): void {
  (el as HTMLElement).click();
}

export function reveal(el: Element, win: Window): void {
  if (!el.isConnected) {
    return;
  }
  el.scrollIntoView({
    behavior: "instant",
    block: "nearest",
    inline: "nearest",
  });
  const slide = slideOf(el, win);
  const track = slide?.parentElement;
  if (!(slide && track)) {
    return;
  }
  const slides = [...track.children].filter((s) => s.tagName === slide.tagName);
  const index = slides.indexOf(slide);
  const buttons = buttonsNear(slide);

  // Dots: a row of sibling controls, one per slide, in order.
  const rows = new Map<Element | null, Element[]>();
  for (const b of buttons) {
    if (NEXT.test(labelOf(b)) || PREV.test(labelOf(b))) {
      continue;
    }
    const row = rows.get(b.parentElement) ?? [];
    row.push(b);
    rows.set(b.parentElement, row);
  }
  const dots = [...rows.values()].find((row) => row.length === slides.length);
  if (dots) {
    click(dots[index]);
    return;
  }

  // Arrows: step toward the slide, one press at a time. Each press has to
  // land before the next, or a slider that reads its state from the last
  // render would count all of them as one.
  const current = slides.findIndex((s) => !isOffstage(s, win));
  const forward = current === -1 || index > current;
  const arrow = buttons.find((b) => (forward ? NEXT : PREV).test(labelOf(b)));
  if (arrow) {
    step(arrow, slide, win, MAX_STEPS);
  }
}

function step(arrow: Element, slide: Element, win: Window, left: number): void {
  if (left === 0 || !isOffstage(slide, win)) {
    return;
  }
  click(arrow);
  win.setTimeout(() => step(arrow, slide, win, left - 1), STEP_MS);
}
