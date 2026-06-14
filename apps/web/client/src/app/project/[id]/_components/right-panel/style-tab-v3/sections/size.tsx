'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    CustomExpander,
    GrowRow,
    NumberField,
    OverflowRow,
    PropertyControl,
    PropertyLabel,
    SelectField,
} from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

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

const SIZE_UNIT_OPTIONS = [
    { value: 'px', label: 'Px' },
    { value: '%', label: '%' },
    { value: 'rem', label: 'Rem' },
    { value: 'em', label: 'Em' },
    { value: 'vw', label: 'Vw' },
    { value: 'vh', label: 'Vh' },
    { value: 'auto', label: 'Auto' },
];

/**
 * Size — Width/Height/Max W/Max H surface up top with their unit selector.
 * Min W/H + aspect-ratio + object-fit + box-sizing live in the Custom
 * expander since the Figma design shows just the four primary rows. Grow +
 * Overflow toolbar matches the Figma's icon row.
 */
export const SizeSection = observer(function SizeSection() {
    const t = useTranslations('editor.stylePanel');
    const width = useStyleValue('width');
    const height = useStyleValue('height');
    const maxWidth = useStyleValue('max-width');
    const maxHeight = useStyleValue('max-height');
    const minWidth = useStyleValue('min-width');
    const minHeight = useStyleValue('min-height');
    const aspectRatio = useStyleValue('aspect-ratio');
    const objectFit = useStyleValue('object-fit');
    const boxSizing = useStyleValue('box-sizing');
    const overflow = useStyleValue('overflow');
    const overflowX = useStyleValue('overflow-x');
    const overflowY = useStyleValue('overflow-y');
    const flexGrow = useStyleValue('flex-grow');

    // A "Grow" preset is active when any of the properties it writes —
    // flex-grow / width / height — is explicitly set.
    const growIsSet = flexGrow.isSet || width.isSet || height.isSet;
    // Overflow is "set" when the shorthand or either axis is explicit.
    const overflowIsSet = overflow.isSet || overflowX.isSet || overflowY.isSet;

    const setCount = [
        width,
        height,
        maxWidth,
        maxHeight,
        minWidth,
        minHeight,
        aspectRatio,
        objectFit,
        boxSizing,
        overflowX,
        overflowY,
    ].filter((v) => v.isSet).length;

    const advancedSetCount = [minWidth, minHeight, aspectRatio, objectFit, boxSizing].filter(
        (v) => v.isSet,
    ).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    return (
        <Section id="size" title={t('section.size')} setCount={setCount}>
            <PropertyControl property="width" label={t('size.width')}>
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        units={SIZE_UNIT_OPTIONS.map((o) => o.value)}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="height" label={t('size.height')}>
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        units={SIZE_UNIT_OPTIONS.map((o) => o.value)}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="max-width" label={t('size.maxWidth')}>
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        units={SIZE_UNIT_OPTIONS.map((o) => o.value)}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="max-height" label={t('size.maxHeight')}>
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        units={SIZE_UNIT_OPTIONS.map((o) => o.value)}
                    />
                )}
            </PropertyControl>
            <div className="flex items-center gap-3 px-3 py-1">
                <PropertyLabel label={t('size.grow')} isSet={growIsSet} />
                <div className="min-w-0 flex-1">
                    <GrowRow isSet={growIsSet} />
                </div>
            </div>
            <div className="flex items-center gap-3 px-3 py-1">
                <PropertyLabel label={t('size.overflow')} isSet={overflowIsSet} />
                <div className="min-w-0 flex-1">
                    <OverflowRow isSet={overflowIsSet} />
                </div>
            </div>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="min-width" label={t('size.minWidth')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="min-height" label={t('size.minHeight')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="aspect-ratio" label={t('size.ratio')}>
                    {({ value, commit }) => (
                        <NumberField
                            value={value}
                            onCommit={commit}
                            defaultUnit=""
                            units={[]}
                            placeholder="e.g. 16/9"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="object-fit" label={t('size.fit')}>
                    {({ value, commit }) => (
                        <SelectField value={value} options={FIT_OPTIONS} onCommit={commit} />
                    )}
                </PropertyControl>
                <PropertyControl property="box-sizing" label={t('size.boxSizing')}>
                    {({ value, commit }) => (
                        <SelectField value={value} options={BOX_SIZING_OPTIONS} onCommit={commit} />
                    )}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
