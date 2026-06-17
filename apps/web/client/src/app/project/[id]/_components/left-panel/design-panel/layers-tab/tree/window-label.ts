import type { Frame } from '@weblab/models';

/**
 * Label shown for a "window" row in the Layers panel.
 *
 * A window row maps to a canvas frame, so we surface the frame's
 * breakpoint/device name (e.g. "Desktop", "Tablet", "Phone") rather than the
 * literal `<body>` tag that backs the row in the DOM.
 *
 * Resolution order:
 *  1. The frame's saved breakpoint name (set per device/breakpoint).
 *  2. A width-derived device bucket, when no name is available.
 *  3. A generic "Window" fallback when the frame can't be resolved.
 */
export function getWindowLabel(frame: Frame | null | undefined): string {
    const breakpointName = frame?.breakpoint?.name?.trim();
    if (breakpointName) {
        return breakpointName;
    }

    const width = frame?.dimension?.width ?? frame?.breakpoint?.width;
    if (typeof width === 'number' && width > 0) {
        if (width <= 480) return 'Mobile';
        if (width <= 1024) return 'Tablet';
        return 'Desktop';
    }

    return 'Window';
}
