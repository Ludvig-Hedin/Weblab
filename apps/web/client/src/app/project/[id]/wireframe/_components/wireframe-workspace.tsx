'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@weblab/ui/button';

import type { WireframeMode } from './mode-switcher';
import type { FullDoc } from './types';
import type { Id } from '@convex/_generated/dataModel';
import { DesignView } from './design-view';
import { ModeSwitcher } from './mode-switcher';
import { SitemapView } from './sitemap-view';
import { StyleGuideView } from './style-guide-view';
import { WireframeView } from './wireframe-view';

function FullScreenLoader({ label }: { label: string }) {
    return (
        <div className="bg-background-secondary flex h-screen w-full items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="animate-spin" /> {label}
            </div>
        </div>
    );
}

export function WireframeWorkspace({
    projectId,
    projectName,
}: {
    projectId: Id<'projects'>;
    projectName: string;
}) {
    const existing = useQuery(api.wireframes.getDoc, { projectId });
    const ensureDoc = useMutation(api.wireframes.ensureDoc);
    const ensuredRef = useRef(false);

    useEffect(() => {
        if (existing === null && !ensuredRef.current) {
            ensuredRef.current = true;
            void ensureDoc({ projectId });
        }
    }, [existing, ensureDoc, projectId]);

    const docId = existing?._id ?? null;
    const full = useQuery(api.wireframes.getFullDoc, docId ? { docId } : 'skip');

    const [mode, setMode] = useState<WireframeMode>('sitemap');

    if (existing === undefined) return <FullScreenLoader label="Loading workspace…" />;
    if (!full) return <FullScreenLoader label="Preparing your project…" />;

    const fullDoc = full as FullDoc;
    const hasSitemap = fullDoc.sitemapPages.length > 0;
    const hasWireframes = fullDoc.wireframePages.length > 0;
    const enabled: Record<WireframeMode, boolean> = {
        sitemap: true,
        wireframe: hasSitemap,
        styleGuide: hasWireframes,
        design: hasWireframes,
    };

    return (
        <div className="bg-background-secondary flex h-screen flex-col">
            <header className="border-border bg-background flex items-center justify-between gap-3 border-b px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/project/${projectId}`}>
                            <ArrowLeft /> Editor
                        </Link>
                    </Button>
                    <span className="text-foreground truncate text-sm font-medium">
                        {projectName}
                    </span>
                </div>
                <ModeSwitcher
                    mode={mode}
                    enabled={enabled}
                    onChange={(next) => {
                        if (enabled[next]) setMode(next);
                    }}
                />
                <div className="hidden w-[120px] sm:block" aria-hidden />
            </header>

            <main className="min-h-0 flex-1 overflow-hidden">
                {mode === 'sitemap' && (
                    <SitemapView full={fullDoc} onGotoWireframe={() => setMode('wireframe')} />
                )}
                {mode === 'wireframe' && (
                    <WireframeView full={fullDoc} onGotoSitemap={() => setMode('sitemap')} />
                )}
                {mode === 'styleGuide' && <StyleGuideView full={fullDoc} />}
                {mode === 'design' && (
                    <DesignView full={fullDoc} onGotoWireframe={() => setMode('wireframe')} />
                )}
            </main>
        </div>
    );
}
