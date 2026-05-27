import type { Orientation, Theme } from '@weblab/constants';

import type { RectDimension, RectPosition } from './rect';

export type BreakpointId = 'desktop' | 'tablet' | 'phone' | (string & {});

export interface FrameBreakpoint {
    id: BreakpointId;
    name: string;
    width: number;
    order: number;
}

/**
 * Figma-style canvas layout guide types. `grid` renders a symmetric pixel
 * grid; `columns` / `rows` render a Bootstrap-style track grid with
 * count + margin + gutter (+ optional alignment + per-column width).
 */
export type LayoutGuideType = 'grid' | 'columns' | 'rows';
export type LayoutGuideAlignment = 'stretch' | 'left' | 'center' | 'right' | 'top' | 'bottom';

/**
 * Per-frame layout guide instance. Stored as an array on the Frame so a
 * single frame can stack multiple guides (e.g. a 12-column grid + a row
 * baseline) like Figma. When `styleId` is set, the visible fields mirror
 * a project-level saved style — detaching prompts an inline confirm.
 */
export interface LayoutGuideConfig {
    /** Local id used to diff/update individual entries in the array. */
    id: string;
    type: LayoutGuideType;
    /** Eye-icon state — drives per-guide visibility in the overlay. */
    visible: boolean;
    /** Hex with alpha, e.g. "#FF000019" for 10% red — matches Figma input. */
    color: string;
    // ── Grid only ────────────────────────────────────────────────────────
    /** Cell size in canvas pixels (Grid type). */
    size?: number;
    // ── Columns / Rows ───────────────────────────────────────────────────
    /** Number of tracks (Columns / Rows). */
    count?: number;
    /** Alignment of the track set inside the frame. */
    alignment?: LayoutGuideAlignment;
    /** Per-track size in px, or `null` for Figma's "Auto" (fill). */
    width?: number | null;
    /** Outer margin in px before first track and after last. */
    margin?: number;
    /** Spacing in px between tracks. */
    gutter?: number;
    /** When set, this guide is linked to a project-level saved style. */
    styleId?: string | null;
}

export interface Frame {
    // IDs
    id: string;
    branchId: string;
    canvasId: string;

    // group + responsive metadata
    groupId: string;
    breakpoint: FrameBreakpoint;

    // display data
    position: RectPosition;
    dimension: RectDimension;

    // content
    url: string;

    // Optional Figma-style layout guides drawn on top of the frame. Most
    // frames have 0 or 1; the array form keeps multi-guide stacks
    // (column grid + row baseline) representable without a schema change.
    layoutGuides?: LayoutGuideConfig[];
}

export interface WindowMetadata {
    orientation: Orientation;
    aspectRatioLocked: boolean;
    device: string;
    theme: Theme;
    width: number;
    height: number;
}
