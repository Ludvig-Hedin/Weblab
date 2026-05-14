'use client';

import { useState } from 'react';
import { Box, LayoutGrid, Square } from 'lucide-react';

import { AlignmentToolbar } from '@/app/project/[id]/_components/right-panel/style-tab-v3/controls/alignment-toolbar';
import { ChipInput } from '@/app/project/[id]/_components/right-panel/style-tab-v3/controls/chip-input';
import { CustomExpander } from '@/app/project/[id]/_components/right-panel/style-tab-v3/controls/custom-expander';
import { SegmentedDisplay } from '@/app/project/[id]/_components/right-panel/style-tab-v3/controls/segmented-display';
import { StyleChipPicker } from '@/app/project/[id]/_components/right-panel/style-tab-v3/controls/style-chip-picker';

interface DemoRowProps {
    title: string;
    caption: string;
    children: React.ReactNode;
}

function DemoRow({ title, caption, children }: DemoRowProps) {
    return (
        <div className="flex flex-col gap-2">
            <div>
                <p className="text-foreground-primary text-small font-medium">{title}</p>
                <p className="text-foreground-tertiary text-mini">{caption}</p>
            </div>
            {children}
        </div>
    );
}

/**
 * Visual reference for the seven Style Panel v3 primitives. The TRBL grid and
 * Grow/Overflow row read/write through MobX `StyleManager`, so they require
 * a selected element to function — they're referenced here in source but
 * rendered as a pointer to the live panel rather than mounted standalone.
 */
export function StylePanelV3Demo() {
    const [chips, setChips] = useState<string[]>(['flex', 'items-center', 'gap-2']);
    const [display, setDisplay] = useState<string>('flex');
    const [align, setAlign] = useState<string>('');
    const [styleValue, setStyleValue] = useState<string>('');
    const [customOpen, setCustomOpen] = useState<boolean>(false);
    const [expanderOpen, setExpanderOpen] = useState<boolean>(false);

    return (
        <div id="style-panel-v3" className="flex w-full max-w-[280px] flex-col gap-6">
            <DemoRow title="ChipInput" caption="Class list / multi-tag editor (Element section).">
                <ChipInput
                    chips={chips}
                    onChange={setChips}
                    placeholder="Add a class…"
                    ariaLabel="Demo chip input"
                />
            </DemoRow>

            <DemoRow title="SegmentedDisplay" caption="Display tri-state (Layout section).">
                <SegmentedDisplay
                    value={display}
                    onCommit={setDisplay}
                    options={[
                        {
                            value: 'flex',
                            label: 'Flex',
                            icon: <LayoutGrid className="size-3" />,
                        },
                        { value: 'grid', label: 'Grid', icon: <Box className="size-3" /> },
                        {
                            value: 'block',
                            label: 'Block',
                            icon: <Square className="size-3" />,
                        },
                    ]}
                    ariaLabel="Display"
                />
            </DemoRow>

            <DemoRow title="AlignmentToolbar" caption="Six-icon position alignment row.">
                <AlignmentToolbar value={align} onCommit={(next) => setAlign(next)} />
            </DemoRow>

            <DemoRow title="StyleChipPicker" caption="Named-style chip + Custom expander toggle.">
                <StyleChipPicker
                    value={styleValue}
                    options={[
                        { name: 'h1', label: 'Heading 1', preview: '32 / 700' },
                        { name: 'h2', label: 'Heading 2', preview: '24 / 600' },
                        { name: 'body', label: 'Body', preview: '14 / 400' },
                    ]}
                    kind="Text Style"
                    onApply={setStyleValue}
                    onDetach={() => setStyleValue('')}
                    onToggleCustom={() => setCustomOpen((v) => !v)}
                    customOpen={customOpen}
                />
            </DemoRow>

            <DemoRow
                title="CustomExpander"
                caption="Disclosure that reveals raw CSS controls under any chip section."
            >
                <CustomExpander
                    open={expanderOpen}
                    onOpenChange={setExpanderOpen}
                    summary="3 advanced properties"
                >
                    <div className="text-foreground-secondary text-mini px-3 py-2">
                        Per-prop NumberInputs / Selects sit here in real sections.
                    </div>
                </CustomExpander>
            </DemoRow>

            <DemoRow
                title="TrblGrid + GrowOverflowRow"
                caption="Read/write through MobX StyleManager — exercise inside the live Style v3 panel."
            >
                <p className="text-foreground-tertiary text-mini">
                    Source:{' '}
                    <code className="text-foreground-secondary">
                        style-tab-v3/controls/trbl-grid.tsx
                    </code>{' '}
                    +{' '}
                    <code className="text-foreground-secondary">
                        style-tab-v3/controls/grow-overflow-row.tsx
                    </code>
                </p>
            </DemoRow>
        </div>
    );
}
