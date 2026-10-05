/**
 * Page scroll for the editor's "Lock canvas" page view. The editor covers the
 * frame with a gesture layer, so wheel events never reach the page; the editor
 * forwards them here and the page scrolls natively (sticky headers, 100vh
 * sections and scroll-driven effects all behave like a real browser).
 */
export function scrollPageBy(dx: number, dy: number): { x: number; y: number } {
    window.scrollBy({ left: dx, top: dy, behavior: 'instant' });
    return { x: window.scrollX, y: window.scrollY };
}
