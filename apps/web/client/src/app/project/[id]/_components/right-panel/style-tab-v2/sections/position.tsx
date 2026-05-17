'use client';

import { Move } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const POSITION_OPTIONS = [
    { value: 'static', label: 'Static' },
    { value: 'relative', label: 'Relative' },
    { value: 'absolute', label: 'Absolute' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'sticky', label: 'Sticky' },
];

const FLOAT_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'inline-start', label: 'Inline start' },
    { value: 'inline-end', label: 'Inline end' },
];

const CLEAR_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'both', label: 'Both' },
];

export const PositionSection = observer(function PositionSection() {
    const props = [
        useStyleValue('position'),
        useStyleValue('top'),
        useStyleValue('right'),
        useStyleValue('bottom'),
        useStyleValue('left'),
        useStyleValue('z-index'),
        useStyleValue('float'),
        useStyleValue('clear'),
    ];
    const setCount = props.filter((v) => v.isSet).length;
    const positionValue = props[0]!.value;
    const showOffsets =
        positionValue === 'relative' ||
        positionValue === 'absolute' ||
        positionValue === 'fixed' ||
        positionValue === 'sticky';

    return (
        <Section id="position" title="Position" icon={Move} setCount={setCount}>
            <PropertyControl property="position" label="Type">
                {({ value, commit }) => (
                    <SelectField value={value} options={POSITION_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            {showOffsets && (
                <>
                    <PropertyControl property="top" label="Top">
                        {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
                    </PropertyControl>
                    <PropertyControl property="right" label="Right">
                        {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
                    </PropertyControl>
                    <PropertyControl property="bottom" label="Bottom">
                        {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
                    </PropertyControl>
                    <PropertyControl property="left" label="Left">
                        {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
                    </PropertyControl>
                </>
            )}
            <PropertyControl property="z-index" label="Z-index">
                {({ value, commit }) => (
                    <NumberInput
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={[]}
                        allowKeywords
                    />
                )}
            </PropertyControl>
            <PropertyControl property="float" label="Float">
                {({ value, commit }) => (
                    <SelectField value={value} options={FLOAT_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="clear" label="Clear">
                {({ value, commit }) => (
                    <SelectField value={value} options={CLEAR_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
        </Section>
    );
});
