'use client';

import { observer } from 'mobx-react-lite';

import type { Frame, LayoutGuideAlignment, LayoutGuideConfig } from '@weblab/models';
import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Figma-style per-frame layout guide overlay. Renders Grid / Columns / Rows
 * on top of each frame whose `layoutGuides` array contains visible entries,
 * gated by the canvas-wide `showLayoutGuides` toggle (Shift+G).
 *
 * Each frame gets its own SVG sized + positioned in screen space using the
 * same canvas transform as the canvas-container (`canvasCoord * scale +
 * pan`). Lines use `vector-effect="non-scaling-stroke"` so they stay 1px
 * crisp regardless of canvas zoom.
 *
 * Pointer-events: none so the guides never intercept canvas interactions.
 */
export const LayoutGuideOverlay = observer(() => {
    const editorEngine = useEditorEngine();
    if (!editorEngine.canvas.showLayoutGuides) return null;
    // Hide entirely in PREVIEW mode — the page is supposed to look like the
    // shipped site there, not the editor scaffold.
    if (editorEngine.state.editorMode === EditorMode.PREVIEW) return null;

    const scale = editorEngine.canvas.scale;
    const pan = editorEngine.canvas.position;
    const frames = editorEngine.frames.getAll();
    // Match the existing canvas overlay: fade out during active pan/scroll
    // so the user gets a clean canvas while gesturing, then fade back in.
    // Pointer events stay off either way.
    const hide = editorEngine.state.shouldHideOverlay;

    return (
        <div
            aria-hidden
            className={cn(
                // No explicit z-index — relying on DOM order so the selection
                // ring (rendered later in canvas/index.tsx) paints on top of
                // the guide rects rather than under them.
                'pointer-events-none absolute inset-0 overflow-hidden',
                hide ? 'opacity-0' : 'opacity-100 transition-opacity duration-150',
            )}
        >
            {frames.map(({ frame }) => {
                const guides = frame.layoutGuides;
                if (!guides || guides.length === 0) return null;
                if (!guides.some((g) => g.visible)) return null;
                return (
                    <FrameGuides
                        key={frame.id}
                        frame={frame}
                        guides={guides.filter((g) => g.visible)}
                        scale={scale}
                        panX={pan.x}
                        panY={pan.y}
                    />
                );
            })}
        </div>
    );
});

interface FrameGuidesProps {
    frame: Frame;
    guides: LayoutGuideConfig[];
    scale: number;
    panX: number;
    panY: number;
}

function FrameGuides({ frame, guides, scale, panX, panY }: FrameGuidesProps) {
    // Project frame world-coord rect into screen-coord rect. Same formula
    // used by SelectionBoxes and FrameView's translate — keeps the guide
    // overlay pixel-perfectly aligned with the frame.
    const left = frame.position.x * scale + panX;
    const top = frame.position.y * scale + panY;
    // Use breakpoint.width when present (same fallback FrameView uses) so
    // responsive frames render guides against their logical width, not the
    // wider dimension box.
    const width = (frame.breakpoint?.width ?? frame.dimension.width) * scale;
    const height = frame.dimension.height * scale;

    if (width <= 0 || height <= 0) return null;

    // SVG viewBox uses the **frame's** logical pixels so guide math can be
    // written in canvas world coords. The SVG itself is sized to the
    // screen-space rect, so it scales naturally with canvas zoom.
    const vbW = frame.breakpoint?.width ?? frame.dimension.width;
    const vbH = frame.dimension.height;

    return (
        <svg
            style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
            }}
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            shapeRendering="crispEdges"
        >
            {guides.map((guide) => (
                <GuideShape key={guide.id} guide={guide} frameWidth={vbW} frameHeight={vbH} />
            ))}
        </svg>
    );
}

interface GuideShapeProps {
    guide: LayoutGuideConfig;
    frameWidth: number;
    frameHeight: number;
}

function GuideShape({ guide, frameWidth, frameHeight }: GuideShapeProps) {
    const color = guide.color || '#FF000019';

    if (guide.type === 'grid') {
        return <GridGuide color={color} size={guide.size ?? 10} w={frameWidth} h={frameHeight} />;
    }

    if (guide.type === 'columns') {
        const tracks = computeTracks({
            type: 'columns',
            count: guide.count ?? 12,
            alignment: guide.alignment ?? 'stretch',
            trackSize: guide.width ?? null,
            margin: guide.margin ?? 0,
            gutter: guide.gutter ?? 0,
            container: frameWidth,
        });
        return (
            <>
                {tracks.map((t, i) => (
                    <rect
                        key={i}
                        x={t.start}
                        y={0}
                        width={t.size}
                        height={frameHeight}
                        fill={color}
                    />
                ))}
            </>
        );
    }

    // rows
    const tracks = computeTracks({
        type: 'rows',
        count: guide.count ?? 12,
        alignment: guide.alignment ?? 'stretch',
        trackSize: guide.width ?? null,
        margin: guide.margin ?? 0,
        gutter: guide.gutter ?? 0,
        container: frameHeight,
    });
    return (
        <>
            {tracks.map((t, i) => (
                <rect key={i} x={0} y={t.start} width={frameWidth} height={t.size} fill={color} />
            ))}
        </>
    );
}

function GridGuide({ color, size, w, h }: { color: string; size: number; w: number; h: number }) {
    const safeSize = Math.max(1, size);
    const cols = Math.floor(w / safeSize);
    const rows = Math.floor(h / safeSize);
    const lines: JSX.Element[] = [];
    for (let i = 1; i <= cols; i++) {
        const x = i * safeSize;
        lines.push(
            <line
                key={`gv-${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={h}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
            />,
        );
    }
    for (let j = 1; j <= rows; j++) {
        const y = j * safeSize;
        lines.push(
            <line
                key={`gh-${j}`}
                x1={0}
                y1={y}
                x2={w}
                y2={y}
                stroke={color}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
            />,
        );
    }
    return <>{lines}</>;
}

interface TrackSpec {
    type: 'columns' | 'rows';
    count: number;
    alignment: LayoutGuideAlignment;
    trackSize: number | null;
    margin: number;
    gutter: number;
    container: number;
}

/**
 * Figma-compatible track layout. With `alignment: 'stretch'` and
 * `trackSize: null` (Auto), tracks divide the container minus 2× margin
 * minus (count - 1) × gutter equally. Fixed `trackSize` anchors the set to
 * left / center / right (or top / bottom for rows) with the requested
 * pixel width per track.
 */
export function computeTracks(spec: TrackSpec): Array<{ start: number; size: number }> {
    const { count, alignment, trackSize, margin, gutter, container } = spec;
    if (count <= 0 || container <= 0) return [];

    // Stretch + Auto: divide the available space. Matches Figma "Auto" width.
    if (alignment === 'stretch' && (trackSize === null || trackSize === undefined)) {
        const available = Math.max(0, container - 2 * margin - gutter * (count - 1));
        const cellSize = available / count;
        const tracks: Array<{ start: number; size: number }> = [];
        let cursor = margin;
        for (let i = 0; i < count; i++) {
            tracks.push({ start: cursor, size: cellSize });
            cursor += cellSize + gutter;
        }
        return tracks;
    }

    // Fixed track size: total = count * size + (count - 1) * gutter
    const fixedSize = trackSize ?? 0;
    const totalWidth = count * fixedSize + (count - 1) * gutter;
    let startCursor: number;
    switch (alignment) {
        case 'left':
        case 'top':
            startCursor = margin;
            break;
        case 'right':
        case 'bottom':
            startCursor = container - margin - totalWidth;
            break;
        case 'center':
            startCursor = (container - totalWidth) / 2;
            break;
        case 'stretch':
        default:
            // Stretch + fixed size — Figma still pins to left margin in this
            // edge case. Mirroring that here.
            startCursor = margin;
            break;
    }
    const tracks: Array<{ start: number; size: number }> = [];
    let cursor = startCursor;
    for (let i = 0; i < count; i++) {
        tracks.push({ start: cursor, size: fixedSize });
        cursor += fixedSize + gutter;
    }
    return tracks;
}
