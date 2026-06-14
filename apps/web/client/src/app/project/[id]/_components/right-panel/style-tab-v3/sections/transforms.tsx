'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CustomExpander, PropertyControl, SliderField, TextField } from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/**
 * Transforms — Perspective + Rotate sliders surface up top per the Figma.
 * Custom expander reveals raw `transform`, `transform-origin`,
 * `perspective-origin`, `transform-style`, `backface-visibility` (matches v2).
 */
export const TransformsSection = observer(function TransformsSection() {
    const t = useTranslations('editor.stylePanel');
    const perspective = useStyleValue('perspective');
    const rotate = useStyleValue('rotate');
    const transform = useStyleValue('transform');
    const transformOrigin = useStyleValue('transform-origin');
    const perspectiveOrigin = useStyleValue('perspective-origin');
    const transformStyle = useStyleValue('transform-style');
    const backfaceVisibility = useStyleValue('backface-visibility');

    const advancedProps = [
        transform,
        transformOrigin,
        perspectiveOrigin,
        transformStyle,
        backfaceVisibility,
    ];
    const advancedSetCount = advancedProps.filter((v) => v.isSet).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    const setCount = [perspective, rotate, ...advancedProps].filter((v) => v.isSet).length;

    return (
        <Section id="transforms" title={t('section.transforms')} setCount={setCount}>
            <PropertyControl property="perspective" label={t('transforms.perspective')}>
                {({ value, commit }) => (
                    <SliderField value={value} onCommit={commit} min={0} max={2400} suffix="" />
                )}
            </PropertyControl>
            <PropertyControl property="rotate" label={t('transforms.rotate')}>
                {({ value, commit }) => (
                    <SliderField value={value} onCommit={commit} min={0} max={360} suffix="°" />
                )}
            </PropertyControl>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="transform" label={t('transforms.transform')}>
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="translate(0,0) scale(1)"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="transform-origin" label={t('transforms.origin')}>
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="center center" />
                    )}
                </PropertyControl>
                <PropertyControl property="perspective-origin" label={t('transforms.pOrigin')}>
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="50% 50%" />
                    )}
                </PropertyControl>
                <PropertyControl property="transform-style" label={t('transforms.style')}>
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="flat | preserve-3d"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="backface-visibility" label={t('transforms.backface')}>
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="visible | hidden" />
                    )}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
