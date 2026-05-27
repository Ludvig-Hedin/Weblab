import type { RectPosition } from './rect';

export interface Canvas {
    id: string;
    scale: number;
    position: RectPosition;
    userId: string;
    /**
     * Per-user canvas UI toggles. Persisted alongside scale/position on the
     * `userCanvases` Convex row so toggles survive reload and roam across
     * devices. Optional because legacy rows predate the columns; readers
     * must default to `false` (rulers) / `true` (layout guides) when missing.
     */
    showRulers?: boolean;
    showLayoutGuides?: boolean;
}
