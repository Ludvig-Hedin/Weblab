'use client';

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { ResizablePanel } from '@weblab/ui/resizable';

import { useEditorEngine } from '@/components/store/editor';
import { PageTab } from '@/components/ui/settings-modal/site/page';

const MIN_WIDTH = 360;
const MAX_WIDTH = 760;

/**
 * Webflow-style per-page settings drawer. Opens from the cog on a page row in
 * the left-panel Pages tab, anchored immediately to the right of the left
 * panel and covering the canvas area. Resizable from its right edge.
 */
export const PageSettingsDrawer = observer(({ toolbarLeft }: { toolbarLeft: number }) => {
    const editorEngine = useEditorEngine();
    const { pageSettingsOpen, pageSettingsPagePath, pageSettingsWidth } = editorEngine.state;

    // Refresh page metadata from the sandbox each time the drawer opens, so the
    // form reflects edits made directly in code since the last scan.
    useEffect(() => {
        if (pageSettingsOpen) {
            void editorEngine.pages.scanPages();
        }
    }, [editorEngine.pages, pageSettingsOpen]);

    // Close on Escape — matches the global settings modal's behaviour.
    useEffect(() => {
        if (!pageSettingsOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                editorEngine.state.closePageSettings();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editorEngine.state, pageSettingsOpen]);

    if (!pageSettingsOpen || !pageSettingsPagePath) {
        return null;
    }

    const page = editorEngine.pages.getPageByPath(pageSettingsPagePath);

    return (
        <div className="absolute top-14 z-50 h-[calc(100%-49px)]" style={{ left: toolbarLeft }}>
            <ResizablePanel
                side="left"
                defaultWidth={pageSettingsWidth}
                minWidth={MIN_WIDTH}
                maxWidth={MAX_WIDTH}
                onWidthChange={(width) => editorEngine.state.setPageSettingsWidth(width)}
                className="bg-background border-border border-r shadow-lg"
            >
                <div className="flex h-full flex-col">
                    <div className="border-border/50 flex shrink-0 items-center gap-2 border-b px-4 py-3">
                        <Icons.Gear className="text-foreground-tertiary h-4 w-4 shrink-0" />
                        <h2
                            className="text-regularPlus truncate"
                            title={page?.name ?? pageSettingsPagePath}
                        >
                            {page?.name ?? pageSettingsPagePath}
                        </h2>
                        <span
                            className="text-mini text-foreground-tertiary truncate"
                            title={pageSettingsPagePath}
                        >
                            {pageSettingsPagePath}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto shrink-0"
                            onClick={() => editorEngine.state.closePageSettings()}
                            aria-label="Close page settings"
                        >
                            <Icons.CrossS className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <PageTab
                            key={pageSettingsPagePath}
                            metadata={page?.metadata}
                            path={pageSettingsPagePath}
                            onPathChange={(path) =>
                                editorEngine.state.setPageSettingsPagePath(path)
                            }
                        />
                    </div>
                </div>
            </ResizablePanel>
        </div>
    );
});
