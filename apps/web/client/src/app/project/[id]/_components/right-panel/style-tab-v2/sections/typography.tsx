'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';

import { ColorField } from '../controls/color-field';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

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

const TEXT_ALIGN_OPTIONS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
    { value: 'justify', label: 'Justify' },
    { value: 'start', label: 'Start' },
    { value: 'end', label: 'End' },
];

const TEXT_TRANSFORM_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'uppercase', label: 'Uppercase' },
    { value: 'lowercase', label: 'Lowercase' },
    { value: 'capitalize', label: 'Capitalize' },
];

const TEXT_DECORATION_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'underline', label: 'Underline' },
    { value: 'overline', label: 'Overline' },
    { value: 'line-through', label: 'Strikethrough' },
];

const FONT_STYLE_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'italic', label: 'Italic' },
    { value: 'oblique', label: 'Oblique' },
];

const DIRECTION_OPTIONS = [
    { value: 'ltr', label: 'Left to right' },
    { value: 'rtl', label: 'Right to left' },
];

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
        <Section id="typography" title="Typography" setCount={setCount}>
            {/* ── Core ──────────────────────────────────────── */}
            <PropertyControl property="font-family" label="Font">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="Inter, sans-serif" />
                )}
            </PropertyControl>
            <PropertyControl property="font-weight" label="Weight">
                {({ value, commit }) => (
                    <SelectField value={value} options={FONT_WEIGHT_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="font-size" label="Size">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="line-height" label="Line H">
                {({ value, commit }) => (
                    <NumberInput
                        compact
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={['', 'px', 'rem', 'em', '%']}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="letter-spacing" label="Spacing">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="text-align" label="Align">
                {({ value, commit }) => (
                    <SelectField value={value} options={TEXT_ALIGN_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="text-transform" label="Transform">
                {({ value, commit }) => (
                    <SelectField value={value} options={TEXT_TRANSFORM_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="text-decoration-line" label="Decor">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={TEXT_DECORATION_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="font-style" label="Style">
                {({ value, commit }) => (
                    <SelectField value={value} options={FONT_STYLE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>

            {/* ── Advanced toggle ───────────────────────────── */}
            {!displayAdvanced && (
                <button
                    type="button"
                    onClick={() => setShowAdvanced(true)}
                    className="text-foreground-secondary hover:text-foreground-primary mx-3 mt-0.5 mb-1 self-start text-[11px]"
                >
                    + More options
                </button>
            )}

            {/* ── Advanced ──────────────────────────────────── */}
            {displayAdvanced && (
                <>
                    <div className="border-border/30 mx-3 mt-1 mb-0.5 flex items-center gap-2 border-t pt-1">
                        <span className="text-foreground-secondary text-[10px] tracking-wider uppercase">
                            Advanced
                        </span>
                        {!advancedSetCount && (
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(false)}
                                className="text-foreground-secondary hover:text-foreground-primary ml-auto text-[10px]"
                            >
                                Hide
                            </button>
                        )}
                    </div>
                    <PropertyControl property="direction" label="Direction">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={DIRECTION_OPTIONS}
                                onCommit={commit}
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
                    <PropertyControl property="word-break" label="Word brk">
                        {({ value, commit }) => (
                            <SelectField
                                value={value}
                                options={WORD_BREAK_OPTIONS}
                                onCommit={commit}
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="line-break" label="Line brk">
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
                            <NumberInput compact value={value} onCommit={commit} />
                        )}
                    </PropertyControl>
                    <PropertyControl property="column-count" label="Columns">
                        {({ value, commit }) => (
                            <NumberInput
                                compact
                                value={value}
                                onCommit={commit}
                                defaultUnit=""
                                units={[]}
                                allowKeywords
                            />
                        )}
                    </PropertyControl>
                    <PropertyControl property="-webkit-text-stroke-width" label="Stroke W">
                        {({ value, commit }) => (
                            <NumberInput compact value={value} onCommit={commit} />
                        )}
                    </PropertyControl>
                    <PropertyControl property="-webkit-text-stroke-color" label="Stroke C">
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
