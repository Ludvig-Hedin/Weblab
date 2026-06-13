'use client';

import type { CSSProperties, ReactNode } from 'react';

/** A scaled "browser window" around a full-width page render. */
export function FramePreview({
    title,
    frameWidth,
    scale,
    children,
}: {
    title: string;
    frameWidth: number;
    scale: number;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <span className="bg-border h-2 w-2 rounded-full" />
                {title}
            </div>
            <div className="border-border bg-background overflow-hidden rounded-xl border shadow-sm">
                {/* `zoom` scales layout AND the occupied height, so the frame takes
                    the right amount of space without measuring its content. */}
                <div style={{ width: frameWidth, zoom: scale } as CSSProperties}>{children}</div>
            </div>
        </div>
    );
}
