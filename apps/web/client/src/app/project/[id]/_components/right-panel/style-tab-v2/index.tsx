'use client';

import { observer } from 'mobx-react-lite';

import { Accordion } from '@weblab/ui/accordion';
import { ScrollArea } from '@weblab/ui/scroll-area';

import { useEditorEngine } from '@/components/store/editor';
import { useResetHotkey } from './hooks/use-reset-hotkey';
import { useSectionState } from './hooks/use-section-state';
import { BackgroundsSection } from './sections/backgrounds';
import { BordersSection } from './sections/borders';
import { ContentSection } from './sections/content';
import { CustomPropertiesSection } from './sections/custom-properties';
import { EffectsSection } from './sections/effects';
import { ElementHeaderSection } from './sections/element-header';
import { InteractionsSection } from './sections/interactions';
import { LayoutSection } from './sections/layout';
import { PositionSection } from './sections/position';
import { SizeSection } from './sections/size';
import { SpacingSection } from './sections/spacing';
import { TransformsSection } from './sections/transforms';
import { TransitionsSection } from './sections/transitions';
import { TypographySection } from './sections/typography';

const DEFAULT_OPEN_SECTIONS = ['layout', 'spacing', 'typography'] as const;

const StyleTabV2Empty = () => (
    <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2">
            <p className="text-foreground-primary text-small font-medium">No element selected</p>
            <p className="text-foreground-tertiary text-mini">
                Select an element on the canvas to edit its styles.
            </p>
        </div>
    </div>
);

export const StyleTabV2 = observer(function StyleTabV2() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const { open, setOpen } = useSectionState(DEFAULT_OPEN_SECTIONS);
    useResetHotkey();

    if (!selected) return <StyleTabV2Empty />;

    return (
        <ScrollArea className="h-full">
            {/* Element header scrolls with everything else — the panel reads as
                one continuous column. The first Section renders its own
                top-border hairline, so we don't add a divider here. */}
            <ElementHeaderSection />
            <Accordion type="multiple" value={open} onValueChange={setOpen} className="px-0 pb-6">
                <ContentSection />
                <LayoutSection />
                <SpacingSection />
                <SizeSection />
                <PositionSection />
                <TypographySection />
                <BackgroundsSection />
                <BordersSection />
                <EffectsSection />
                <TransformsSection />
                <TransitionsSection />
                <InteractionsSection />
                <CustomPropertiesSection />
            </Accordion>
        </ScrollArea>
    );
});
