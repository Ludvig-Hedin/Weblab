'use client';

import { Maximize2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { PropertyLabel } from '../controls/property-label';
import { SelectField } from '../controls/select-field';
import { useStyleSetter } from '../hooks/use-style-setter';
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

interface PairedRowProps {
    label: string;
    widthProperty: string;
    heightProperty: string;
}

/** Two-input row used for Min and Max width/height pairs. */
function PairedRow({ label, widthProperty, heightProperty }: PairedRowProps) {
    const width = useStyleValue(widthProperty);
    const height = useStyleValue(heightProperty);
    const widthSetter = useStyleSetter(widthProperty);
    const heightSetter = useStyleSetter(heightProperty);
    const anySet = width.isSet || height.isSet;
    return (
        <div className="group/control flex items-center gap-3 px-3 py-1">
            <PropertyLabel label={label} isSet={anySet} title={label} />
            <div className="flex min-w-0 flex-1 items-end gap-1.5">
                {/* Two NumberInputs in one row — drop the per-input unit pill
                    or they collectively overflow the panel width. */}
                <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                    <NumberInput
                        value={width.value}
                        onCommit={widthSetter.set}
                        units={[]}
                        className="text-center"
                        aria-label={widthProperty}
                    />
                    <span className="text-foreground-tertiary text-tiny leading-none">W</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                    <NumberInput
                        value={height.value}
                        onCommit={heightSetter.set}
                        units={[]}
                        className="text-center"
                        aria-label={heightProperty}
                    />
                    <span className="text-foreground-tertiary text-tiny leading-none">H</span>
                </div>
            </div>
        </div>
    );
}

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
        <Section id="size" title="Size" icon={Maximize2} setCount={setCount}>
            <PropertyControl property="width" label="Width">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="height" label="Height">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PairedRow label="Min" widthProperty="min-width" heightProperty="min-height" />
            <PairedRow label="Max" widthProperty="max-width" heightProperty="max-height" />
            <PropertyControl property="aspect-ratio" label="Ratio">
                {({ value, commit }) => (
                    <NumberInput
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
