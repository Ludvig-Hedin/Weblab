import { penpalParent } from '../..';

// Element rects are read in viewport space, so the editor must re-measure its
// selection boxes whenever the page scrolls (wheel, anchor links, JS scroll).
// Settle first: the editor hides its boxes while scrolling anyway.
const SCROLL_SETTLE_MS = 80;

export function listenForScroll() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener(
        'scroll',
        () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                penpalParent?.onWindowResized().catch((error: Error) => {
                    console.error('Failed to send window scroll event:', error);
                });
            }, SCROLL_SETTLE_MS);
        },
        { passive: true },
    );
}
