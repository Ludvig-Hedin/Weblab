'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { NamedStyleOption } from '../controls/style-chip-picker';
import {
    ColorPickerInline,
    ColorRow,
    CustomExpander,
    GroupShell,
    LabeledSelectInput,
    NumberField,
    ShadowField,
    StyleChipPicker,
    TextField,
} from '../controls';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
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
] as const;

const OUTLINE_STYLE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
] as const;

// ── Effect presets ─────────────────────────────────────────────────────────────

interface EffectPreset {
    name: string;
    label: string;
    preview: string;
    styles: Record<string, string>;
}

const EFFECT_PRESETS: EffectPreset[] = [
    {
        name: 'shadow-sm',
        label: 'Shadow S',
        preview: '0 1px 2px',
        styles: { 'box-shadow': '0 1px 2px 0 rgba(0,0,0,0.05)' },
    },
    {
        name: 'shadow-md',
        label: 'Shadow M',
        preview: '0 4px 6px',
        styles: {
            'box-shadow': '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
        },
    },
    {
        name: 'shadow-lg',
        label: 'Shadow L',
        preview: '0 10px 15px',
        styles: {
            'box-shadow': '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
        },
    },
    {
        name: 'shadow-xl',
        label: 'Shadow XL',
        preview: '0 20px 25px',
        styles: {
            'box-shadow': '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
        },
    },
    {
        name: 'blur-sm',
        label: 'Blur S',
        preview: 'blur(2px)',
        styles: { filter: 'blur(2px)' },
    },
    {
        name: 'blur-md',
        label: 'Blur M',
        preview: 'blur(4px)',
        styles: { filter: 'blur(4px)' },
    },
    {
        name: 'blur-lg',
        label: 'Blur L',
        preview: 'blur(8px)',
        styles: { filter: 'blur(8px)' },
    },
    {
        name: 'frosted',
        label: 'Frosted glass',
        preview: 'blur(12px)',
        styles: { 'backdrop-filter': 'blur(12px)' },
    },
];

const EFFECT_STYLE_OPTIONS: readonly NamedStyleOption[] = EFFECT_PRESETS.map((p) => ({
    name: p.name,
    label: p.label,
    preview: p.preview,
}));

function detectAppliedPreset(values: Record<string, string>): string {
    for (const preset of EFFECT_PRESETS) {
        const match = Object.entries(preset.styles).every(([key, val]) => values[key] === val);
        if (match) return preset.name;
    }
    return '';
}

// ── Component ──────────────────────────────────────────────────────────────────

export const EffectsSection = observer(function EffectsSection() {
    const blendMode = useStyleValue('mix-blend-mode');
    const outlineStyle = useStyleValue('outline-style');
    const outlineWidth = useStyleValue('outline-width');
    const outlineColor = useStyleValue('outline-color');
    const outlineOffset = useStyleValue('outline-offset');
    const boxShadow = useStyleValue('box-shadow');
    const filter = useStyleValue('filter');
    const backdropFilter = useStyleValue('backdrop-filter');

    const blendModeSetter = useStyleSetter('mix-blend-mode');
    const outlineStyleSetter = useStyleSetter('outline-style');
    const outlineWidthSetter = useStyleSetter('outline-width');
    const outlineColorSetter = useStyleSetter('outline-color');
    const outlineOffsetSetter = useStyleSetter('outline-offset');
    const boxShadowSetter = useStyleSetter('box-shadow');
    const filterSetter = useStyleSetter('filter');
    const backdropFilterSetter = useStyleSetter('backdrop-filter');

    const { setMultiple } = useStyleBatchSetter();

    const advancedSetCount = [
        blendMode,
        outlineStyle,
        outlineWidth,
        outlineColor,
        outlineOffset,
        boxShadow,
        filter,
        backdropFilter,
    ].filter((v) => v.isSet).length;

    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    // Auto-open when an element that already has effects is selected.
    useEffect(() => {
        if (advancedSetCount > 0) setCustomOpen(true);
    }, [advancedSetCount]);

    // Auto-close when switching to an element with no effects set.
    useEffect(() => {
        if (advancedSetCount === 0) setCustomOpen(false);
    }, [advancedSetCount]);

    // Detect which preset (if any) matches the current effect values.
    const appliedPreset = detectAppliedPreset({
        'box-shadow': boxShadow.value,
        filter: filter.value,
        'backdrop-filter': backdropFilter.value,
    });

    const handleApplyPreset = (name: string) => {
        const preset = EFFECT_PRESETS.find((p) => p.name === name);
        if (!preset) return;
        setMultiple(
            Object.entries(preset.styles).map(([property, value]) => ({ property, value })),
        );
    };

    const handleDetachPreset = () => {
        const preset = EFFECT_PRESETS.find((p) => p.name === appliedPreset);
        if (!preset) return;
        setMultiple(Object.entries(preset.styles).map(([property]) => ({ property, value: '' })));
    };

    return (
        <Section id="effects" title="Effects">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label="Style">
                    <div className="group/control flex items-center">
                        <StyleChipPicker
                            value={appliedPreset}
                            options={EFFECT_STYLE_OPTIONS}
                            kind="Effect"
                            onApply={handleApplyPreset}
                            onDetach={handleDetachPreset}
                            onToggleCustom={() => setCustomOpen((v) => !v)}
                            customOpen={customOpen}
                        />
                    </div>
                </GroupShell>

                <CustomExpander
                    open={customOpen}
                    onOpenChange={setCustomOpen}
                    summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
                >
                    <GroupShell label="Shadow" onReset={() => boxShadowSetter.set('')}>
                        <ShadowField value={boxShadow.value} onCommit={boxShadowSetter.set} />
                    </GroupShell>

                    <GroupShell label="Filter" onReset={() => filterSetter.set('')}>
                        <TextField
                            value={filter.value}
                            onCommit={filterSetter.set}
                            placeholder="blur(4px) brightness(0.9)"
                        />
                    </GroupShell>

                    <GroupShell
                        label="Backdrop filter"
                        onReset={() => backdropFilterSetter.set('')}
                    >
                        <TextField
                            value={backdropFilter.value}
                            onCommit={backdropFilterSetter.set}
                            placeholder="blur(8px)"
                        />
                    </GroupShell>

                    <GroupShell label="Blend mode" onReset={() => blendModeSetter.set('')}>
                        <LabeledSelectInput
                            label="Mode"
                            value={blendMode.value}
                            options={BLEND_MODE_OPTIONS}
                            onCommit={blendModeSetter.set}
                        />
                    </GroupShell>

                    <GroupShell label="Outline style" onReset={() => outlineStyleSetter.set('')}>
                        <LabeledSelectInput
                            label="Style"
                            value={outlineStyle.value}
                            options={OUTLINE_STYLE_OPTIONS}
                            onCommit={outlineStyleSetter.set}
                        />
                    </GroupShell>

                    <GroupShell label="Outline width" onReset={() => outlineWidthSetter.set('')}>
                        <NumberField value={outlineWidth.value} onCommit={outlineWidthSetter.set} />
                    </GroupShell>

                    <GroupShell label="Outline color" onReset={() => outlineColorSetter.set('')}>
                        <ColorRow
                            value={outlineColor.value}
                            onCommit={outlineColorSetter.set}
                            pickerContent={
                                <ColorPickerInline
                                    value={outlineColor.value}
                                    onCommit={outlineColorSetter.set}
                                />
                            }
                        />
                    </GroupShell>

                    <GroupShell label="Outline offset" onReset={() => outlineOffsetSetter.set('')}>
                        <NumberField
                            value={outlineOffset.value}
                            onCommit={outlineOffsetSetter.set}
                        />
                    </GroupShell>
                </CustomExpander>
            </div>
        </Section>
    );
});
