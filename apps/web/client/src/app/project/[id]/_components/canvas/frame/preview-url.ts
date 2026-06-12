import { Routes } from '@/utils/constants';
import { isLocalPreviewUrl } from './use-sandbox-liveness';

/**
 * Make a preview URL safe to load directly in an iframe / browser tab.
 *
 * Dynamic-route segments (`[slug]`) are not real, navigable URLs — the running
 * dev server would 404 on them — so we substitute a concrete placeholder
 * (`temp-slug`). This is the same substitution the inline `PreviewOverlay` and
 * the per-frame "open in new tab" link use; centralised here so the three call
 * sites can't drift.
 */
export function toPreviewableUrl(url: string): string {
    return url.replace(/\[([^\]]+)\]/g, 'temp-$1');
}

/**
 * Route to the standalone, resilient preview window for a project.
 * (Rendered by `app/project/[id]/preview/page.tsx`.)
 */
export function getPopoutRoute(projectId: string): string {
    return `${Routes.PROJECT}/${projectId}/preview`;
}

export type PreviewWindowMode = 'tab' | 'window';

// Sized popup for side-by-side use next to the editor (second-monitor friendly).
const WINDOW_FEATURES = 'width=1280,height=800,noopener,noreferrer';

/**
 * Open the project's preview in its own surface.
 *
 * - **Cloud** sandboxes (`https://*.vercel.run`) open the wrapper page
 *   (`getPopoutRoute`) which adds liveness-driven auto-recovery + chrome.
 * - **Local/desktop** dev servers (`http://localhost:PORT`) open the raw URL
 *   directly: an https-origin wrapper page can't iframe an http localhost URL
 *   (mixed content), and a local dev server doesn't recycle so it needs no
 *   resilience chrome. It still hot-reloads via the dev server's own HMR.
 *
 * `mode === 'window'` opens a sized popup; `'tab'` opens a plain new tab.
 * Returns the opened `Window` (or `null` if blocked) so callers can react.
 */
export function openPreviewWindow(
    projectId: string,
    url: string,
    mode: PreviewWindowMode,
): Window | null {
    const target = isLocalPreviewUrl(url) ? toPreviewableUrl(url) : getPopoutRoute(projectId);
    const features = mode === 'window' ? WINDOW_FEATURES : 'noopener,noreferrer';
    return window.open(target, '_blank', features);
}
