'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';
import { PublishButton } from './top-bar/publish';

/**
 * Tailwind-aligned breakpoint labels. The user's previewed site is rendered at
 * the *parent viewport* size (we don't constrain the iframe further), so the
 * breakpoint we display is whichever Tailwind range that viewport falls into.
 * If the user resizes the browser, the badge updates live.
 */
const BREAKPOINTS: { label: string; min: number }[] = [
    { label: '2xl', min: 1536 },
    { label: 'xl', min: 1280 },
    { label: 'lg', min: 1024 },
    { label: 'md', min: 768 },
    { label: 'sm', min: 640 },
    { label: 'xs', min: 0 },
];

function getBreakpoint(width: number): string {
    for (const bp of BREAKPOINTS) {
        if (width >= bp.min) return bp.label;
    }
    return 'xs';
}

function useViewportSize(): { width: number; height: number } {
    const [size, setSize] = useState<{ width: number; height: number }>(() => ({
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight,
    }));
    useEffect(() => {
        const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return size;
}

/**
 * Full-viewport preview of the previewed site. Replaces the editor chrome
 * entirely — like "Open in new tab" but inline so the user doesn't lose context.
 *
 * Source URL: prefers the first selected frame, otherwise the first frame.
 * Reload: bumps a key so the iframe remounts with the same src.
 */
export const PreviewOverlay = observer(() => {
    const editorEngine = useEditorEngine();
    const viewport = useViewportSize();
    const [reloadKey, setReloadKey] = useState(0);

    // Resolved each render — MobX `observer` re-runs the component when the
    // underlying observable frames change, so explicit memoization is noise.
    // Pick the first selected frame, otherwise the first one.
    const allFrames = editorEngine.frames.getAll();
    const sourceFrame =
        allFrames.find((data) => data?.selected)?.frame ?? allFrames[0]?.frame ?? null;
    // Dynamic-route segments (`[slug]`) aren't real URLs — same substitution as
    // the per-frame "open in new tab" link uses.
    const previewUrl = sourceFrame ? sourceFrame.url.replace(/\[([^\]]+)\]/g, 'temp-$1') : null;

    const breakpoint = getBreakpoint(viewport.width);

    const handleClose = () => editorEngine.state.setEditorMode(EditorMode.DESIGN);
    const handleReload = () => setReloadKey((k) => k + 1);

    return (
        <div className="bg-background-canvas fixed inset-0 z-[60] flex flex-col">
            {/* Preview chrome: matches bottom-bar styling so the preview reads as
                a tool surface, not a website chrome. */}
            <header className="bg-background-chrome border-border-bar flex h-14 items-center gap-3 border-b px-4">
                <div className="flex flex-1 items-center gap-3">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close preview"
                                onClick={handleClose}
                                className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 w-8 rounded-md"
                            >
                                <Icons.CrossL className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            Close preview
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Reload preview"
                                onClick={handleReload}
                                className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-bar-active h-8 w-8 rounded-md"
                            >
                                <Icons.Reload className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            Reload
                        </TooltipContent>
                    </Tooltip>
                </div>

                {/* Center: breakpoint label + live viewport dimensions. */}
                <div className="text-foreground-secondary flex items-center gap-2 text-xs tabular-nums">
                    <span className="bg-background-bar-active text-foreground-primary rounded-md px-2 py-1 text-[11px] font-medium uppercase">
                        {breakpoint}
                    </span>
                    <span>
                        {viewport.width} × {viewport.height}
                    </span>
                </div>

                <div className="flex flex-1 items-center justify-end gap-2">
                    <PublishButton />
                </div>
            </header>

            <div className="bg-background-canvas relative flex-1 overflow-hidden">
                {previewUrl ? (
                    <iframe
                        key={reloadKey}
                        title="Site preview"
                        src={previewUrl}
                        className="h-full w-full border-0"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <p className="text-foreground-tertiary text-sm">No frame to preview.</p>
                    </div>
                )}
            </div>
        </div>
    );
});
