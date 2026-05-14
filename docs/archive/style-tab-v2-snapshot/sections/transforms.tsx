'use client';

import { RotateCw } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { TextField } from '../controls/text-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/**
 * Transforms section. Today the panel exposes the standalone `transform` and
 * `perspective` properties as raw text + dedicated `transform-origin` /
 * `perspective` controls. A richer additive list (translate/rotate/scale/skew
 * rows that compose into a single `transform` string) lands in a follow-up.
 */
export const TransformsSection = observer(function TransformsSection() {
    const props = [
        useStyleValue('transform'),
        useStyleValue('transform-origin'),
        useStyleValue('perspective'),
        useStyleValue('perspective-origin'),
        useStyleValue('transform-style'),
        useStyleValue('backface-visibility'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="transforms" title="Transforms" icon={RotateCw} setCount={setCount}>
            <PropertyControl property="transform" label="Transform">
                {({ value, commit }) => (
                    <TextField
                        value={value}
                        onCommit={commit}
                        placeholder="translate(0,0) rotate(0deg) scale(1)"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="transform-origin" label="Origin">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="center center" />
                )}
            </PropertyControl>
            <PropertyControl property="perspective" label="Perspective">
                {({ value, commit }) => (
                    <NumberInput value={value} onCommit={commit} defaultUnit="px" />
                )}
            </PropertyControl>
            <PropertyControl property="perspective-origin" label="P origin">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="50% 50%" />
                )}
            </PropertyControl>
            <PropertyControl property="transform-style" label="Style">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="flat | preserve-3d" />
                )}
            </PropertyControl>
            <PropertyControl property="backface-visibility" label="Backface">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="visible | hidden" />
                )}
            </PropertyControl>
        </Section>
    );
});
