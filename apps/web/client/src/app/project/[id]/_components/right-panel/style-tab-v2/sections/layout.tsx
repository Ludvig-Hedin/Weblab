'use client';

import type { LucideIcon } from 'lucide-react';
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
    ArrowDown,
    ArrowDownToLine,
    ArrowRight,
    ArrowRightToLine,
    ArrowUpToLine,
    Baseline,
    LayoutGrid,
    MoveHorizontal,
    MoveVertical,
    Rows3,
    StretchHorizontal,
    StretchVertical,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { Section } from '../../_shared/section';
import { IconToggleField } from '../controls/icon-toggle-field';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { useStyleValue } from '../hooks/use-style-value';

const Icon = ({ icon: I, flipY }: { icon: LucideIcon; flipY?: boolean }) => (
    <I className={flipY ? 'size-3.5 -scale-y-100' : 'size-3.5'} />
);

const DISPLAY_OPTIONS = [
    { value: 'block', label: 'Block' },
    { value: 'flex', label: 'Flex' },
    { value: 'inline-flex', label: 'Inline flex' },
    { value: 'grid', label: 'Grid' },
    { value: 'inline-grid', label: 'Inline grid' },
    { value: 'inline-block', label: 'Inline block' },
    { value: 'inline', label: 'Inline' },
    { value: 'none', label: 'None' },
];

const FLEX_DIRECTION_ICONS = [
    { value: 'row', label: 'Row', icon: <Icon icon={ArrowRight} /> },
    {
        value: 'row-reverse',
        label: 'Row reverse',
        icon: <ArrowRight className="size-3.5 -scale-x-100" />,
    },
    { value: 'column', label: 'Column', icon: <Icon icon={ArrowDown} /> },
    {
        value: 'column-reverse',
        label: 'Column reverse',
        icon: <ArrowDown className="size-3.5 -scale-y-100" />,
    },
] as const;

const JUSTIFY_ROW_ICONS = [
    {
        value: 'flex-start',
        label: 'Start',
        icon: <Icon icon={AlignStartVertical} />,
    },
    {
        value: 'center',
        label: 'Center',
        icon: <Icon icon={AlignCenterVertical} />,
    },
    { value: 'flex-end', label: 'End', icon: <Icon icon={AlignEndVertical} /> },
    {
        value: 'space-between',
        label: 'Space between',
        icon: <Icon icon={MoveHorizontal} />,
    },
    { value: 'space-around', label: 'Space around', icon: <Icon icon={Rows3} /> },
    {
        value: 'space-evenly',
        label: 'Space evenly',
        icon: <Icon icon={Rows3} flipY />,
    },
] as const;

const JUSTIFY_COL_ICONS = [
    { value: 'flex-start', label: 'Start', icon: <Icon icon={ArrowUpToLine} /> },
    {
        value: 'center',
        label: 'Center',
        icon: <Icon icon={AlignCenterHorizontal} />,
    },
    { value: 'flex-end', label: 'End', icon: <Icon icon={ArrowDownToLine} /> },
    {
        value: 'space-between',
        label: 'Space between',
        icon: <Icon icon={MoveVertical} />,
    },
    { value: 'space-around', label: 'Space around', icon: <Icon icon={Rows3} /> },
    {
        value: 'space-evenly',
        label: 'Space evenly',
        icon: <Icon icon={Rows3} flipY />,
    },
] as const;

const ALIGN_ROW_ICONS = [
    {
        value: 'flex-start',
        label: 'Start',
        icon: <Icon icon={AlignStartHorizontal} />,
    },
    {
        value: 'center',
        label: 'Center',
        icon: <Icon icon={AlignCenterHorizontal} />,
    },
    { value: 'flex-end', label: 'End', icon: <Icon icon={AlignEndHorizontal} /> },
    {
        value: 'stretch',
        label: 'Stretch',
        icon: <Icon icon={StretchHorizontal} />,
    },
    { value: 'baseline', label: 'Baseline', icon: <Icon icon={Baseline} /> },
] as const;

const ALIGN_COL_ICONS = [
    {
        value: 'flex-start',
        label: 'Start',
        icon: <Icon icon={ArrowRightToLine} />,
    },
    {
        value: 'center',
        label: 'Center',
        icon: <Icon icon={AlignCenterVertical} />,
    },
    {
        value: 'flex-end',
        label: 'End',
        icon: <ArrowRightToLine className="size-3.5 -scale-x-100" />,
    },
    { value: 'stretch', label: 'Stretch', icon: <Icon icon={StretchVertical} /> },
    { value: 'baseline', label: 'Baseline', icon: <Icon icon={Baseline} /> },
] as const;

export const LayoutSection = observer(function LayoutSection() {
    const display = useStyleValue('display');
    const flexDirection = useStyleValue('flex-direction');
    const justifyContent = useStyleValue('justify-content');
    const alignItems = useStyleValue('align-items');
    const gap = useStyleValue('gap');

    const setCount = [display, flexDirection, justifyContent, alignItems, gap].filter(
        (v) => v.isSet,
    ).length;

    const isFlexOrGrid =
        display.value === 'flex' ||
        display.value === 'inline-flex' ||
        display.value === 'grid' ||
        display.value === 'inline-grid';
    const isFlexOnly = display.value === 'flex' || display.value === 'inline-flex';
    const isColumn = flexDirection.value === 'column' || flexDirection.value === 'column-reverse';

    return (
        <Section id="layout" title="Layout" icon={LayoutGrid} setCount={setCount}>
            <PropertyControl property="display" label="Display">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={DISPLAY_OPTIONS}
                        onCommit={commit}
                        placeholder="Choose…"
                    />
                )}
            </PropertyControl>
            {!isFlexOrGrid && (
                <p className="text-foreground-tertiary text-mini px-3 py-1">
                    Set Display to Flex or Grid to align children.
                </p>
            )}
            {isFlexOrGrid && (
                <>
                    {isFlexOnly && (
                        <PropertyControl property="flex-direction" label="Direction">
                            {({ value, commit }) => (
                                <IconToggleField
                                    value={value}
                                    options={FLEX_DIRECTION_ICONS}
                                    onCommit={commit}
                                    ariaLabel="Flex direction"
                                />
                            )}
                        </PropertyControl>
                    )}
                    <PropertyControl property="justify-content" label="Justify">
                        {({ value, commit }) => (
                            <IconToggleField
                                value={value}
                                options={isColumn ? JUSTIFY_COL_ICONS : JUSTIFY_ROW_ICONS}
                                onCommit={commit}
                                ariaLabel="Justify content"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="align-items" label="Align">
                        {({ value, commit }) => (
                            <IconToggleField
                                value={value}
                                options={isColumn ? ALIGN_COL_ICONS : ALIGN_ROW_ICONS}
                                onCommit={commit}
                                ariaLabel="Align items"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="gap" label="Gap">
                        {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
                    </PropertyControl>
                </>
            )}
        </Section>
    );
});
