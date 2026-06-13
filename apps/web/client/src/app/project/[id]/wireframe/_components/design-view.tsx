'use client';

import { useState } from 'react';
import { Minus, Monitor, Plus, Smartphone, Tablet } from 'lucide-react';

import { Button } from '@weblab/ui/button';
import { asStyleGuideTokens, styleGuideToCssVars } from '@weblab/wireframe-blocks';

import type { FullDoc, ProjectId } from './types';
import { BlockFrame } from './block-frame';
import { EmitButton } from './emit-button';
import { FramePreview } from './frame-preview';

const WIDTHS = { desktop: 1280, tablet: 834, mobile: 390 } as const;
type Responsive = keyof typeof WIDTHS;

export function DesignView({
    full,
    projectId,
    onGotoWireframe,
}: {
    full: FullDoc;
    projectId: ProjectId;
    onGotoWireframe: () => void;
}) {
    const [responsive, setResponsive] = useState<Responsive>('desktop');
    const [scale, setScale] = useState(0.4);

    const pages = [...full.wireframePages].sort((a, b) => a.order - b.order);
    const active =
        full.styleGuides.find((g) => g._id === full.doc.activeStyleGuideId) ??
        full.styleGuides.find((g) => g.isActive) ??
        null;
    const styleVars = active ? styleGuideToCssVars(asStyleGuideTokens(active.tokens)) : undefined;

    if (pages.length === 0) {
        return (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
                <h2 className="text-foreground text-lg font-semibold">Nothing to design yet</h2>
                <p className="text-muted-foreground text-sm">
                    Generate wireframes first, then apply a style guide to see the designed pages.
                </p>
                <Button onClick={onGotoWireframe}>Go to wireframes</Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="border-border flex items-center justify-between gap-3 border-b px-6 py-2">
                <div className="border-border inline-flex items-center gap-1 rounded-lg border p-1">
                    <Button
                        variant={responsive === 'desktop' ? 'default' : 'ghost'}
                        size="icon-sm"
                        onClick={() => setResponsive('desktop')}
                    >
                        <Monitor />
                    </Button>
                    <Button
                        variant={responsive === 'tablet' ? 'default' : 'ghost'}
                        size="icon-sm"
                        onClick={() => setResponsive('tablet')}
                    >
                        <Tablet />
                    </Button>
                    <Button
                        variant={responsive === 'mobile' ? 'default' : 'ghost'}
                        size="icon-sm"
                        onClick={() => setResponsive('mobile')}
                    >
                        <Smartphone />
                    </Button>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setScale(Math.max(0.2, scale - 0.04))}
                        >
                            <Minus />
                        </Button>
                        <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
                            {Math.round(scale * 100)}%
                        </span>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setScale(Math.min(0.6, scale + 0.04))}
                        >
                            <Plus />
                        </Button>
                    </div>
                    <EmitButton full={full} projectId={projectId} />
                </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-6">
                <div className="flex flex-wrap items-start gap-8">
                    {pages.map((page) => (
                        <FramePreview
                            key={page._id}
                            title={page.title}
                            frameWidth={WIDTHS[responsive]}
                            scale={scale}
                        >
                            <div style={styleVars}>
                                <BlockFrame
                                    sections={full.wireframeSections
                                        .filter((s) => s.wireframePageId === page._id)
                                        .sort((a, b) => a.order - b.order)
                                        .map((s) => ({
                                            _id: s._id,
                                            blockId: s.blockId,
                                            content: s.content as unknown,
                                        }))}
                                />
                            </div>
                        </FramePreview>
                    ))}
                </div>
            </div>
        </div>
    );
}
