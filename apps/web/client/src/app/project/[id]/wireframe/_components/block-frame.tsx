'use client';

import type { CSSProperties } from 'react';

import { getBlockRenderer } from '@weblab/wireframe-blocks/browser';

import { SectionBoundary } from './section-boundary';

export interface FrameSection {
    _id: string;
    blockId: string;
    content: unknown;
}

/**
 * Renders a page's wireframe sections using the REAL block components. Grayscale
 * in wireframe mode; style-guide CSS-var overrides (styleVars) in design mode.
 */
export function BlockFrame({
    sections,
    styleVars,
    grayscale,
}: {
    sections: FrameSection[];
    styleVars?: CSSProperties;
    grayscale?: boolean;
}) {
    const style: CSSProperties = {
        ...styleVars,
        ...(grayscale ? { filter: 'grayscale(1)' } : {}),
    };
    return (
        <div className="bg-background text-foreground" style={style}>
            {sections.length === 0 ? (
                <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
                    No sections on this page yet.
                </div>
            ) : (
                sections.map((s) => {
                    const Comp = getBlockRenderer(s.blockId);
                    return (
                        <SectionBoundary key={s._id} label={s.blockId}>
                            {Comp ? (
                                <Comp content={s.content} />
                            ) : (
                                <div className="border-border text-muted-foreground border border-dashed p-6 text-center text-sm">
                                    Unknown block: {s.blockId}
                                </div>
                            )}
                        </SectionBoundary>
                    );
                })
            )}
        </div>
    );
}
