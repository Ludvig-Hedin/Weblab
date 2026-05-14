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
    ArrowRight,
    EyeOff,
    LayoutGrid,
    Square,
    StretchHorizontal,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';

import {
    IconToggleField,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SegmentedDisplay,
    SelectField,
    TrblGrid,
} from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const Icon = ({ icon: I }: { icon: LucideIcon }) => <I className="size-3" />;

const DISPLAY_OPTIONS = [
    // Flex reads as "flowing items along an axis"; Grid inherits the
    // grid-cells glyph; Block stays the plain square; None is the
    // crossed-out eye for "not rendered".
    { value: 'flex', label: 'Flex', icon: <Icon icon={StretchHorizontal} /> },
    { value: 'grid', label: 'Grid', icon: <Icon icon={LayoutGrid} /> },
    { value: 'block', label: 'Block', icon: <Icon icon={Square} /> },
    { value: 'none', label: 'None', icon: <Icon icon={EyeOff} /> },
];

const FLEX_DIRECTION_ICONS = [
    { value: 'row', label: 'Row', icon: <Icon icon={ArrowRight} /> },
    { value: 'column', label: 'Column', icon: <Icon icon={ArrowDown} /> },
] as const;

const DISTRIBUTE_OPTIONS = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'space-between', label: 'Space between' },
    { value: 'space-around', label: 'Space around' },
    { value: 'space-evenly', label: 'Space evenly' },
];

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
] as const;

const ALIGN_COL_ICONS = [
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
] as const;

const WRAP_OPTIONS = [
    { value: 'wrap', label: 'Yes' },
    { value: 'nowrap', label: 'No' },
];

/**
 * Layout — Display segmented (Flex/Grid/Block/None) + per-mode children.
 * Padding and Margin both live in this section per the Figma — box spacing
 * reads better next to its layout context than buried in Advanced.
 */
export const LayoutSection = observer(function LayoutSection() {
    const display = useStyleValue('display');
    const direction = useStyleValue('flex-direction');
    const justifyContent = useStyleValue('justify-content');
    const alignItems = useStyleValue('align-items');
    const flexWrap = useStyleValue('flex-wrap');
    const gap = useStyleValue('gap');
    const padTop = useStyleValue('padding-top');
    const padRight = useStyleValue('padding-right');
    const padBottom = useStyleValue('padding-bottom');
    const padLeft = useStyleValue('padding-left');
    const marginTop = useStyleValue('margin-top');
    const marginRight = useStyleValue('margin-right');
    const marginBottom = useStyleValue('margin-bottom');
    const marginLeft = useStyleValue('margin-left');

    const setCount = [
        display,
        direction,
        justifyContent,
        alignItems,
        flexWrap,
        gap,
        padTop,
        padRight,
        padBottom,
        padLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
    ].filter((v) => v.isSet).length;

    const isFlex = display.value === 'flex' || display.value === 'inline-flex';
    const isColumn = direction.value === 'column' || direction.value === 'column-reverse';
    const padAnySet = padTop.isSet || padRight.isSet || padBottom.isSet || padLeft.isSet;
    const marginAnySet =
        marginTop.isSet || marginRight.isSet || marginBottom.isSet || marginLeft.isSet;

    return (
        <Section id="layout" title="Layout" setCount={setCount}>
            <PropertyControl property="display" label="Display">
                {({ value, isSet, commit }) => (
                    <SegmentedDisplay
                        value={
                            value === 'inline-flex'
                                ? 'flex'
                                : value === 'inline-grid'
                                  ? 'grid'
                                  : value
                        }
                        isSet={isSet}
                        options={DISPLAY_OPTIONS}
                        onCommit={commit}
                        ariaLabel="Display"
                    />
                )}
            </PropertyControl>
            {isFlex && (
                <>
                    <PropertyControl property="flex-direction" label="Direction">
                        {({ value, isSet, commit }) => (
                            <IconToggleField
                                value={value}
                                isSet={isSet}
                                options={FLEX_DIRECTION_ICONS}
                                onCommit={commit}
                                ariaLabel="Flex direction"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="justify-content" label="Distribute">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={DISTRIBUTE_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="align-items" label="Align">
                        {({ value, isSet, commit }) => (
                            <IconToggleField
                                value={value}
                                isSet={isSet}
                                options={isColumn ? ALIGN_COL_ICONS : ALIGN_ROW_ICONS}
                                onCommit={commit}
                                ariaLabel="Align items"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="flex-wrap" label="Wrap">
                        {({ value, isSet, commit }) => (
                            <IconToggleField
                                value={value}
                                isSet={isSet}
                                options={WRAP_OPTIONS.map((o) => ({
                                    ...o,
                                    icon: <span className="text-mini">{o.label}</span>,
                                }))}
                                onCommit={commit}
                                ariaLabel="Flex wrap"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="gap" label="Gap">
                        {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                    </PropertyControl>
                </>
            )}
            <div className="flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="Padding" isSet={padAnySet} />
                <div className="min-w-0 flex-1">
                    <TrblGrid prefix="padding" />
                </div>
            </div>
            <div className="flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="Margin" isSet={marginAnySet} />
                <div className="min-w-0 flex-1">
                    <TrblGrid prefix="margin" allowKeywords />
                </div>
            </div>
        </Section>
    );
});
