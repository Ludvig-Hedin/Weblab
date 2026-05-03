'use client';

import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const OVERFLOW_OPTIONS = [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'auto', label: 'Auto' },
];

const FIT_OPTIONS = [
    { value: 'fill', label: 'Fill' },
    { value: 'contain', label: 'Contain' },
    { value: 'cover', label: 'Cover' },
    { value: 'none', label: 'None' },
    { value: 'scale-down', label: 'Scale down' },
];

const BOX_SIZING_OPTIONS = [
    { value: 'border-box', label: 'Border box' },
    { value: 'content-box', label: 'Content box' },
];

export const SizeSection = observer(function SizeSection() {
    const props = [
        useStyleValue('width'),
        useStyleValue('height'),
        useStyleValue('min-width'),
        useStyleValue('min-height'),
        useStyleValue('max-width'),
        useStyleValue('max-height'),
        useStyleValue('aspect-ratio'),
        useStyleValue('object-fit'),
        useStyleValue('box-sizing'),
        useStyleValue('overflow-x'),
        useStyleValue('overflow-y'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="size" title="Size" setCount={setCount}>
            <PropertyControl property="width" label="Width">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="height" label="Height">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="min-width" label="Min W">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="min-height" label="Min H">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="max-width" label="Max W">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="max-height" label="Max H">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="aspect-ratio" label="Ratio">
                {({ value, commit }) => (
                    <NumberInput
                        compact
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={[]}
                        placeholder="e.g. 16/9"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="object-fit" label="Fit">
                {({ value, commit }) => (
                    <SelectField value={value} options={FIT_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="box-sizing" label="Box sizing">
                {({ value, commit }) => (
                    <SelectField value={value} options={BOX_SIZING_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="overflow-x" label="Overflow X">
                {({ value, commit }) => (
                    <SelectField value={value} options={OVERFLOW_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="overflow-y" label="Overflow Y">
                {({ value, commit }) => (
                    <SelectField value={value} options={OVERFLOW_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
        </Section>
    );
});
