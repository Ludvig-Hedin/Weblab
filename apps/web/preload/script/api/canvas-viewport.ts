/**
 * Canvas viewport for editor frames.
 *
 * The editor grows each frame to the full page height. Viewport units would
 * then grow with the frame: a 100vh hero becomes as tall as the page, which
 * makes the page taller, and the frame runs away to tens of thousands of
 * pixels. This pins vh/svh/dvh/lvh to the breakpoint's screen height, hides
 * the frame's own scrollbar, and holds video and audio still while editing.
 * Preview mode lets media play again.
 */

const STYLE_ID = 'weblab-canvas-viewport';
const VH_TEST = /\d(?:s|d|l)?vh\b/;
const VH_PATTERN = /(-?\d*\.?\d+)(?:s|d|l)?vh\b/g;

let pinnedHeight: number | null = null;
let playMedia = true;
let started = false;

/** Original declaration values that used viewport units, per rule. */
const originals = new WeakMap<CSSStyleDeclaration, Map<string, [string, string]>>();
const seenSheets = new WeakSet<CSSStyleSheet>();
const touched = new Set<CSSStyleDeclaration>();

export function setCanvasViewport(options: { height: number | null; playMedia: boolean }): void {
    const height =
        typeof options.height === 'number' && options.height > 0 ? Math.round(options.height) : null;
    const heightChanged = height !== pinnedHeight;
    pinnedHeight = height;
    playMedia = options.playMedia;
    start();
    ensureScrollbarStyle();
    // Visible in devtools: the height this frame's viewport units use.
    document.getElementById(STYLE_ID)?.setAttribute('data-viewport-height', String(height ?? 'auto'));
    if (heightChanged) {
        for (const style of touched) applyTo(style);
    }
    pinNewSheets();
    applyMediaState();
}

function start() {
    if (started) return;
    started = true;
    // Media that starts later (autoplay, scripts calling play()) stays paused
    // while editing.
    document.addEventListener(
        'play',
        (event) => {
            if (!playMedia && event.target instanceof HTMLMediaElement) event.target.pause();
        },
        true,
    );
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        // setTimeout, not requestAnimationFrame: Chromium pauses animation
        // frames in iframes that are scrolled off the canvas.
        setTimeout(() => {
            queued = false;
            pinNewSheets();
            applyMediaState();
        }, 50);
    };
    // New or replaced stylesheets (hot reload, route changes) and new media.
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
    });
    document.addEventListener('load', schedule, true);
}

function ensureScrollbarStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
        'html{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}';
    (document.head ?? document.documentElement).appendChild(style);
}

function pinNewSheets() {
    for (const sheet of Array.from(document.styleSheets)) {
        if (seenSheets.has(sheet)) continue;
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            continue; // cross-origin sheet; its rules are not readable
        }
        // A <link> sheet that is still loading reads as empty. Only mark a
        // sheet as done once it has rules, so it is walked after it loads.
        if (rules.length === 0) continue;
        seenSheets.add(sheet);
        walk(rules);
    }
}

function walk(rules: CSSRuleList) {
    for (const rule of Array.from(rules)) {
        if ('style' in rule && rule.style instanceof CSSStyleDeclaration) {
            record(rule.style);
        }
        // @media, @supports, @layer, @container and nested rules.
        if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
            walk(rule.cssRules);
        }
    }
}

function record(style: CSSStyleDeclaration) {
    if (originals.has(style)) return;
    const found = new Map<string, [string, string]>();
    for (let i = 0; i < style.length; i++) {
        const property = style.item(i);
        const value = style.getPropertyValue(property);
        if (VH_TEST.test(value)) found.set(property, [value, style.getPropertyPriority(property)]);
    }
    originals.set(style, found);
    if (found.size === 0) return;
    touched.add(style);
    applyTo(style);
}

function applyTo(style: CSSStyleDeclaration) {
    const found = originals.get(style);
    if (!found) return;
    for (const [property, [value, priority]] of found) {
        const next =
            pinnedHeight === null
                ? value
                : value.replace(
                      VH_PATTERN,
                      (_, amount: string) =>
                          `${Number(((parseFloat(amount) * pinnedHeight!) / 100).toFixed(2))}px`,
                  );
        style.setProperty(property, next, priority);
    }
}

function applyMediaState() {
    for (const media of Array.from(document.querySelectorAll('video, audio'))) {
        if (!(media instanceof HTMLMediaElement)) continue;
        if (playMedia) {
            if (media.dataset.weblabHeldMedia === '1') {
                delete media.dataset.weblabHeldMedia;
                void media.play().catch(() => undefined);
            }
        } else if (!media.paused || media.autoplay) {
            media.dataset.weblabHeldMedia = '1';
            media.pause();
        }
    }
}
