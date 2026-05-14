'use client';

import { useState } from 'react';
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    ArrowLeftRight,
    CaseLower,
    CaseSensitive,
    CaseUpper,
    Italic,
    Minus,
    Strikethrough,
    Type,
    Underline,
    type LucideIcon,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { ColorField } from '../controls/color-field';
import { FontField } from '../controls/font-field';
import { IconToggleField } from '../controls/icon-toggle-field';
import { InlineButton } from '../controls/inline-button';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const Icon = ({ icon: I }: { icon: LucideIcon }) => <I className="size-3.5" />;

const FONT_WEIGHT_OPTIONS = [
    { value: '100', label: '100 — Thin' },
    { value: '200', label: '200 — Extra light' },
    { value: '300', label: '300 — Light' },
    { value: '400', label: '400 — Normal' },
    { value: '500', label: '500 — Medium' },
    { value: '600', label: '600 — Semi-bold' },
    { value: '700', label: '700 — Bold' },
    { value: '800', label: '800 — Extra bold' },
    { value: '900', label: '900 — Black' },
];

const TEXT_ALIGN_ICONS = [
    { value: 'left', label: 'Left', icon: <Icon icon={AlignLeft} /> },
    { value: 'center', label: 'Center', icon: <Icon icon={AlignCenter} /> },
    { value: 'right', label: 'Right', icon: <Icon icon={AlignRight} /> },
    { value: 'justify', label: 'Justify', icon: <Icon icon={AlignJustify} /> },
] as const;

const TEXT_TRANSFORM_ICONS = [
    { value: 'none', label: 'None', icon: <Icon icon={Minus} /> },
    { value: 'uppercase', label: 'Uppercase', icon: <Icon icon={CaseUpper} /> },
    { value: 'lowercase', label: 'Lowercase', icon: <Icon icon={CaseLower} /> },
    { value: 'capitalize', label: 'Capitalize', icon: <Icon icon={CaseSensitive} /> },
] as const;

const TEXT_DECORATION_ICONS = [
    { value: 'none', label: 'None', icon: <Icon icon={Minus} /> },
    { value: 'underline', label: 'Underline', icon: <Icon icon={Underline} /> },
    { value: 'line-through', label: 'Strikethrough', icon: <Icon icon={Strikethrough} /> },
] as const;

const FONT_STYLE_ICONS = [
    { value: 'normal', label: 'Normal', icon: <Icon icon={Minus} /> },
    { value: 'italic', label: 'Italic', icon: <Icon icon={Italic} /> },
] as const;

const DIRECTION_ICONS = [
    { value: 'ltr', label: 'Left to right', icon: <Icon icon={ArrowLeftRight} /> },
    {
        value: 'rtl',
        label: 'Right to left',
        icon: <ArrowLeftRight className="size-3.5 -scale-x-100" />,
    },
] as const;

const WHITE_SPACE_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'nowrap', label: 'No wrap' },
    { value: 'pre', label: 'Preserve' },
    { value: 'pre-wrap', label: 'Preserve & wrap' },
    { value: 'pre-line', label: 'Preserve newlines' },
    { value: 'break-spaces', label: 'Break spaces' },
];

const WORD_BREAK_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'break-all', label: 'Break all' },
    { value: 'keep-all', label: 'Keep all' },
];

const LINE_BREAK_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'loose', label: 'Loose' },
    { value: 'normal', label: 'Normal' },
    { value: 'strict', label: 'Strict' },
    { value: 'anywhere', label: 'Anywhere' },
];

const OVERFLOW_WRAP_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'break-word', label: 'Break word' },
    { value: 'anywhere', label: 'Anywhere' },
];

export const TypographySection = observer(function TypographySection() {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const coreProps = [
        useStyleValue('font-family'),
        useStyleValue('font-weight'),
        useStyleValue('font-size'),
        useStyleValue('line-height'),
        useStyleValue('letter-spacing'),
        useStyleValue('color'),
        useStyleValue('text-align'),
        useStyleValue('text-transform'),
        useStyleValue('text-decoration-line'),
        useStyleValue('font-style'),
    ];
    const advancedProps = [
        useStyleValue('direction'),
        useStyleValue('white-space'),
        useStyleValue('word-break'),
        useStyleValue('line-break'),
        useStyleValue('overflow-wrap'),
        useStyleValue('text-indent'),
        useStyleValue('column-count'),
        useStyleValue('-webkit-text-stroke-width'),
        useStyleValue('-webkit-text-stroke-color'),
        useStyleValue('text-shadow'),
    ];

    const allProps = [...coreProps, ...advancedProps];
    const setCount = allProps.filter((v) => v.isSet).length;
    const advancedSetCount = advancedProps.filter((v) => v.isSet).length;

    // Show the advanced group if the user opted in OR if any advanced prop is already set.
    const displayAdvanced = showAdvanced || advancedSetCount > 0;

    return (
        <Section id="typography" title="Typography" icon={Type} setCount={setCount}>
            {/* ── Core ──────────────────────────────────────── */}
            <PropertyControl property="font-family" label="Font">
                {({ value, commit }) => <FontField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="font-weight" label="Weight">
                {({ value, commit }) => (
                    <SelectField value={value} options={FONT_WEIGHT_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="font-size" label="Size">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="line-height" label="Line height">
                {({ value, commit }) => (
                    <NumberInput
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={['', 'px', 'rem', 'em', '%']}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="letter-spacing" label="Letter">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="text-align" label="Align">
                {({ value, commit }) => (
                    <IconToggleField
                        value={value}
                        options={TEXT_ALIGN_ICONS}
                        onCommit={commit}
                        ariaLabel="Text alignment"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="text-decoration-line" label="Decoration">
                {({ value, commit }) => (
                    <IconToggleField
                        value={value}
                        options={TEXT_DECORATION_ICONS}
                        onCommit={commit}
                        ariaLabel="Text decoration"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="text-transform" label="Case">
                {({ value, commit }) => (
                    <IconToggleField
                        value={value}
                        options={TEXT_TRANSFORM_ICONS}
                        onCommit={commit}
                        ariaLabel="Text case"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="font-style" label="Style">
                {({ value, commit }) => (
                    <IconToggleField
                        value={value}
                        options={FONT_STYLE_ICONS}
                        onCommit={commit}
                        ariaLabel="Font style"
                    />
                )}
            </PropertyControl>

            {/* ── Advanced toggle ───────────────────────────── */}
            {!displayAdvanced && (
                <InlineButton onClick={() => setShowAdvanced(true)} className="mt-0.5">
                    + More type options
                </InlineButton>
            )}

            {/* ── Advanced ──────────────────────────────────── */}
            {displayAdvanced && (
                <>
                    <div className="border-border/30 mx-3 mt-1 mb-0.5 flex items-center gap-2 border-t pt-1">
                        <span className="text-foreground-secondary text-micro tracking-wider uppercase">
                            Advanced
                        </span>
                        {!advancedSetCount && (
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(false)}
                                aria-label="Hide advanced typography options"
                                className="text-foreground-secondary hover:text-foreground-primary text-micro ml-auto transition-colors"
                            >
                                Hide
                            </button>
                        )}
                    </div>
                    <PropertyControl property="direction" label="Direction">
                        {({ value, commit }) => (
                            <IconToggleField
                                value={value}
                                options={DIRECTION_ICONS}
                                onCommit={commit}
                                ariaLabel="Text direction"
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="white-space" label="Wrap">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={WHITE_SPACE_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="word-break" label="Word break">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={WORD_BREAK_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="line-break" label="Line break">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={LINE_BREAK_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="overflow-wrap" label="Overflow">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={OVERFLOW_WRAP_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="text-indent" label="Indent">
                        {({ value, commit }) => (
                            <NumberInput value={value} onCommit={commit} />
                        )}
                    </PropertyControl>
                    <PropertyControl property="column-count" label="Columns">
                        {({ value, commit }) => (
                            <NumberInput
                                value={value}
                                onCommit={commit}
                                defaultUnit=""
                                units={[]}
                                allowKeywords
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="-webkit-text-stroke-width" label="Stroke">
                        {({ value, commit }) => (
                            <NumberInput value={value} onCommit={commit} />
                        )}
                    </PropertyControl>
                    <PropertyControl property="-webkit-text-stroke-color" label="Stroke color">
                        {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
                    </PropertyControl>
                    <PropertyControl property="text-shadow" label="Shadow">
                        {({ value, commit }) => (
                            <TextField
                                value={value}
                                onCommit={commit}
                                placeholder="0 1px 2px rgba(0,0,0,0.2)"
                            />
                        )}
                    </PropertyControl>
                </>
            )}
        </Section>
    );
});
