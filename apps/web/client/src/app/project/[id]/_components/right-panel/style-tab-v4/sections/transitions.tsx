'use client';

import { observer } from 'mobx-react-lite';

import { NumberField, PropertyControl, SelectField, TextField } from '../controls';
import { Section } from './section';

const TIMING_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'ease', label: 'Ease' },
    { value: 'ease-in', label: 'Ease in' },
    { value: 'ease-out', label: 'Ease out' },
    { value: 'ease-in-out', label: 'Ease in-out' },
];

/**
 * Transitions — a dedicated section for the CSS transition family. Previously
 * lived behind a CustomExpander in Advanced; promoted to its own section so
 * motion settings sit alongside Effects (where they're most often reached
 * for). Carries the shorthand plus the four longhands — property, duration,
 * easing, delay — for full CSS coverage.
 */
export const TransitionsSection = observer(function TransitionsSection() {
    return (
        <Section id="transitions" title="Transitions">
            <PropertyControl property="transition" label="Shorthand">
                {({ value, commit }) => (
                    <TextField value={value} onCommit={commit} placeholder="all 200ms ease" />
                )}
            </PropertyControl>
            <PropertyControl property="transition-property" label="Property">
                {({ value, commit }) => (
                    <TextField
                        value={value}
                        onCommit={commit}
                        placeholder='"all" or "opacity, transform"'
                    />
                )}
            </PropertyControl>
            <PropertyControl property="transition-duration" label="Duration">
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        defaultUnit="ms"
                        units={['ms', 's']}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="transition-timing-function" label="Easing">
                {({ value, commit }) => (
                    <SelectField value={value} options={TIMING_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="transition-delay" label="Delay">
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        defaultUnit="ms"
                        units={['ms', 's']}
                    />
                )}
            </PropertyControl>
        </Section>
    );
});
