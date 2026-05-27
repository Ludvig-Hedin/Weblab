'use client';

import { observer } from 'mobx-react-lite';

import type { Frame } from '@weblab/models';
import { Accordion } from '@weblab/ui/accordion';
import { ScrollArea } from '@weblab/ui/scroll-area';

import { LayoutGuideSection } from './layout-guide';

const DEFAULT_OPEN: string[] = ['layoutGuide'];

/**
 * Frame-level right-panel content. Renders when a frame is selected but no
 * element inside it is — same right-panel surface, different section set.
 *
 * Today the only frame-scoped section is **Layout guide** (Figma parity).
 * Future frame-only controls (frame background, padding, snap targets)
 * slot in alongside without touching the element-style path.
 */
export const FrameSettingsPanel = observer(function FrameSettingsPanel({
    frame,
}: {
    frame: Frame;
}) {
    return (
        <div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden">
            <div className="border-border/30 w-full min-w-0 border-b px-3 py-2">
                <p className="text-foreground-secondary text-[11px] tracking-wider uppercase">
                    Frame
                </p>
                <p className="text-foreground-primary text-sm font-medium">
                    {frame.breakpoint?.name ?? 'Frame'}
                </p>
            </div>
            <ScrollArea className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden">
                <Accordion
                    type="multiple"
                    defaultValue={DEFAULT_OPEN}
                    className="w-full max-w-full min-w-0 px-0 pb-6"
                >
                    <LayoutGuideSection frame={frame} />
                </Accordion>
            </ScrollArea>
        </div>
    );
});
