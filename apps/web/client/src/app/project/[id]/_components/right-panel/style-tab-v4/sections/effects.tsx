'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import {
    ColorField,
    CustomExpander,
    GroupShell,
    LabeledSelectInput,
    NumberField,
    PropertyLabel,
    ShadowField,
    StyleChipPicker,
    TextField,
} from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
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

/**
 * Effects section — StyleChipPicker CTA at the top (effect-style registry not
 * yet built), then a CustomExpander carrying all the raw effect properties.
 * Ported to v4 grammar: each row inside the expander is a GroupShell wrapping
 * the appropriate v4 primitive; content in `flex flex-col gap-3 px-3 pb-3`.
 */
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

    // Auto-open when switching to an element that already has effects set.
    // useState only initializes once; this keeps the expander in sync across selections.
    useEffect(() => {
        if (advancedSetCount > 0) setCustomOpen(true);
    }, [advancedSetCount]);

    return (
        <Section id="effects" title="Effects">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* Style chip — effect-style registry not built yet */}
                <div className="group/control flex items-center gap-3">
                    <PropertyLabel label="Style" isSet={false} title="Apply effect style" />
                    <StyleChipPicker
                        value=""
                        options={[]}
                        kind="Effect"
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
                        <ColorField value={outlineColor.value} onCommit={outlineColorSetter.set} />
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
