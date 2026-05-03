'use client';

import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

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

const FLEX_DIRECTION_OPTIONS = [
    { value: 'row', label: 'Row' },
    { value: 'row-reverse', label: 'Row reverse' },
    { value: 'column', label: 'Column' },
    { value: 'column-reverse', label: 'Column reverse' },
];

const JUSTIFY_OPTIONS = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'space-between', label: 'Space between' },
    { value: 'space-around', label: 'Space around' },
    { value: 'space-evenly', label: 'Space evenly' },
];

const ALIGN_OPTIONS = [
    { value: 'flex-start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'flex-end', label: 'End' },
    { value: 'stretch', label: 'Stretch' },
    { value: 'baseline', label: 'Baseline' },
];

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

    return (
        <Section id="layout" title="Layout" setCount={setCount}>
            <PropertyControl property="display" label="Display">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={DISPLAY_OPTIONS}
                        onCommit={commit}
                        placeholder="Select display"
                    />
                )}
            </PropertyControl>
            {isFlexOrGrid && (
                <>
                    {isFlexOnly && (
                        <PropertyControl property="flex-direction" label="Direction">
                            {({ value, commit }) => (
                                <SelectField
                                    value={value}
                                    options={FLEX_DIRECTION_OPTIONS}
                                    onCommit={commit}
                                />
                            )}
                        </PropertyControl>
                    )}
                    <PropertyControl property="justify-content" label="Justify">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={JUSTIFY_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="align-items" label="Align">
                        {({ value, commit }) => (
                            <SelectField value={value} options={ALIGN_OPTIONS} onCommit={commit} />
                        )}
                    </PropertyControl>
                    <PropertyControl property="gap" label="Gap">
                        {({ value, commit }) => (
                            <NumberInput compact value={value} onCommit={commit} />
                        )}
                    </PropertyControl>
                </>
            )}
        </Section>
    );
});
