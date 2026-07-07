'use client';

import { Sparkles } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { Section } from '../../_shared/section';
import { ColorField } from '../controls/color-field';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { SliderField } from '../controls/slider-field';
import { TextField } from '../controls/text-field';
import { useStyleValue } from '../hooks/use-style-value';

const BLEND_MODE_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'screen', label: 'Screen' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color dodge' },
    { value: 'color-burn', label: 'Color burn' },
    { value: 'hard-light', label: 'Hard light' },
    { value: 'soft-light', label: 'Soft light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
];

const OUTLINE_STYLE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
];

const VISIBILITY_OPTIONS = [
    { value: 'visible', label: 'Visible' },
    { value: 'hidden', label: 'Hidden' },
    { value: 'collapse', label: 'Collapse' },
];

export const EffectsSection = observer(function EffectsSection() {
    const props = [
        useStyleValue('opacity'),
        useStyleValue('mix-blend-mode'),
        useStyleValue('visibility'),
        useStyleValue('outline-style'),
        useStyleValue('outline-width'),
        useStyleValue('outline-color'),
        useStyleValue('outline-offset'),
        useStyleValue('box-shadow'),
        useStyleValue('filter'),
        useStyleValue('backdrop-filter'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="effects" title="Effects" icon={Sparkles} setCount={setCount}>
            <PropertyControl property="opacity" label="Opacity">
                {({ value, commit }) => (
                    <SliderField
                        value={value}
                        onCommit={commit}
                        min={0}
                        max={100}
                        suffix="%"
                        asPercent
                    />
                )}
            </PropertyControl>
            <PropertyControl property="mix-blend-mode" label="Blend">
                {({ value, commit }) => (
                    <SelectField value={value} options={BLEND_MODE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="visibility" label="Visible">
                {({ value, commit }) => (
                    <SelectField value={value} options={VISIBILITY_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="outline-style" label="Outline">
                {({ value, commit }) => (
                    <SelectField value={value} options={OUTLINE_STYLE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="outline-width" label="Out. width">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="outline-color" label="Out. color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="outline-offset" label="Out. offset">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="box-shadow" label="Shadow">
                {({ value, commit }) => (
                    <TextField
                        value={value}
                        onCommit={commit}
                        placeholder="0 4px 12px rgba(0,0,0,0.1)"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="filter" label="Filter">
                {({ value, commit }) => (
                    <TextField
                        value={value}
                        onCommit={commit}
                        placeholder="blur(4px) brightness(0.9)"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="backdrop-filter" label="Backdrop">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="blur(8px)" />
                )}
            </PropertyControl>
        </Section>
    );
});
