'use client';

import { observer } from 'mobx-react-lite';

import { Accordion } from '@weblab/ui/accordion';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';
import { ALL_WRITE_TARGETS } from '@/components/store/editor/style/preferences';
import { useResetHotkey } from './hooks/use-reset-hotkey';
import { useSectionState } from './hooks/use-section-state';
import { BackgroundsSection } from './sections/backgrounds';
import { BordersSection } from './sections/borders';
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

const DEFAULT_OPEN_SECTIONS = ['layout', 'spacing', 'size', 'typography'] as const;

const TARGET_LABEL: Record<WriteTarget, string> = {
    tailwind: 'Tailwind',
    'custom-class': 'Class',
    inline: 'Inline',
};

const StyleTabV2Empty = () => (
    <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-2">
            <p className="text-foreground-primary text-sm font-medium">No element selected</p>
            <p className="text-foreground-tertiary text-xs">
                Pick an element in the canvas to inspect and edit its styles.
            </p>
        </div>
    </div>
);

const WriteTargetToolbar = observer(function WriteTargetToolbar() {
    const editorEngine = useEditorEngine();
    const target = editorEngine.stylePreferences.defaultWriteTarget;
    return (
        <div className="border-border/40 flex items-center gap-2 border-b px-3 py-2">
            <span className="text-foreground-secondary text-[10px] tracking-wider uppercase">
                Write as
            </span>
            <ToggleGroup
                type="single"
                size="sm"
                value={target}
                onValueChange={(value) => {
                    if (!value) return;
                    editorEngine.stylePreferences.setDefaultWriteTarget(value as WriteTarget);
                }}
                className="h-6"
            >
                {ALL_WRITE_TARGETS.map((value) => (
                    <ToggleGroupItem key={value} value={value} className="h-6 px-2 text-[11px]">
                        {TARGET_LABEL[value]}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
});

export const StyleTabV2 = observer(function StyleTabV2() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const { open, setOpen } = useSectionState(DEFAULT_OPEN_SECTIONS);
    useResetHotkey();

    if (!selected) return <StyleTabV2Empty />;

    return (
        <ScrollArea className="h-full">
            <ElementHeaderSection />
            <WriteTargetToolbar />
            <Accordion type="multiple" value={open} onValueChange={setOpen} className="px-0">
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
