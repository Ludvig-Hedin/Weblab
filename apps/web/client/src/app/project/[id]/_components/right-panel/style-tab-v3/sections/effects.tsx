'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    ColorField,
    CustomExpander,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SelectField,
    ShadowField,
    StyleChipPicker,
    TextField,
} from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

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

/**
 * Effects — empty by default with the Figma's "Add Effect" chip CTA. Once
 * the user opens Custom, every raw property from v2's Effects section
 * (blend, outline, shadow, filter, backdrop-filter) is editable. The chip
 * picker side currently shows no saved styles (no effect-style registry
 * exists yet — see plan note); the Custom expander carries full parity.
 */
export const EffectsSection = observer(function EffectsSection() {
    const t = useTranslations('editor.stylePanel');
    const blendMode = useStyleValue('mix-blend-mode');
    const outlineStyle = useStyleValue('outline-style');
    const outlineWidth = useStyleValue('outline-width');
    const outlineColor = useStyleValue('outline-color');
    const outlineOffset = useStyleValue('outline-offset');
    const boxShadow = useStyleValue('box-shadow');
    const filter = useStyleValue('filter');
    const backdropFilter = useStyleValue('backdrop-filter');

    const advancedProps = [
        blendMode,
        outlineStyle,
        outlineWidth,
        outlineColor,
        outlineOffset,
        boxShadow,
        filter,
        backdropFilter,
    ];
    const advancedSetCount = advancedProps.filter((v) => v.isSet).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    const setCount = advancedSetCount;

    return (
        <Section id="effects" title={t('section.effects')} setCount={setCount}>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label={t('effects.style')} isSet={false} title={t('effects.style')} />
                {/* Effect-style registry isn't built yet — the chip shows an
                    honest "coming soon" while the Custom expander below carries
                    full box-shadow / filter / outline parity. */}
                <StyleChipPicker
                    value=""
                    options={[]}
                    kind={t('effects.effectKind')}
                    onApply={() => undefined}
                    onDetach={() => undefined}
                    onToggleCustom={() => setCustomOpen((v) => !v)}
                    customOpen={customOpen}
                    comingSoon
                />
            </div>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="box-shadow" label={t('effects.shadow')}>
                    {({ value, commit }) => <ShadowField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="filter" label={t('effects.filter')}>
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="blur(4px) brightness(0.9)"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="backdrop-filter" label={t('effects.backdrop')}>
                    {({ value, commit }) => (
                        <TextField value={value} onCommit={commit} placeholder="blur(8px)" />
                    )}
                </PropertyControl>
                <PropertyControl property="mix-blend-mode" label={t('effects.blend')}>
                    {({ value, commit }) => (
                        <SelectField value={value} options={BLEND_MODE_OPTIONS} onCommit={commit} />
                    )}
                </PropertyControl>
                <PropertyControl property="outline-style" label={t('effects.outline')}>
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={OUTLINE_STYLE_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="outline-width" label={t('effects.outlineWidthShort')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="outline-color" label={t('effects.outlineColorShort')}>
                    {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="outline-offset" label={t('effects.outlineOffsetShort')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
