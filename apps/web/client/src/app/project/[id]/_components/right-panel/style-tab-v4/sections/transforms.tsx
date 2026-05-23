'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { CustomExpander, PropertyControl, SliderField, TextField } from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/**
 * Transforms — Perspective + Rotate sliders surface up top per the Figma.
 * Custom expander reveals raw `transform`, `transform-origin`,
 * `perspective-origin`, `transform-style`, `backface-visibility` (matches v2).
 */
export const TransformsSection = observer(function TransformsSection() {
    const transform = useStyleValue('transform');
    const transformOrigin = useStyleValue('transform-origin');
    const perspectiveOrigin = useStyleValue('perspective-origin');
    const transformStyle = useStyleValue('transform-style');
    const backfaceVisibility = useStyleValue('backface-visibility');

    const advancedSetCount = [
        transform,
        transformOrigin,
        perspectiveOrigin,
        transformStyle,
        backfaceVisibility,
    ].filter((v) => v.isSet).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    return (
        <Section id="transforms" title="Transforms">
            <PropertyControl property="perspective" label="Perspective">
                {({ value, commit }) => (
                    <SliderField value={value} onCommit={commit} min={0} max={2400} suffix="" />
                )}
            </PropertyControl>
            <PropertyControl property="rotate" label="Rotate">
                {({ value, commit }) => (
                    <SliderField value={value} onCommit={commit} min={0} max={360} suffix="°" />
                )}
            </PropertyControl>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="transform" label="Transform">
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="translate(0,0) scale(1)"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="transform-origin" label="Origin">
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="center center" />
                    )}
                </PropertyControl>
                <PropertyControl property="perspective-origin" label="P Origin">
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="50% 50%" />
                    )}
                </PropertyControl>
                <PropertyControl property="transform-style" label="Style">
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="flat | preserve-3d"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="backface-visibility" label="Backface">
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="visible | hidden" />
                    )}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
