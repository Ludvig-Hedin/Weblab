'use client';

import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { NumberInput } from '@weblab/ui/number-input';

import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const TIMING_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'ease', label: 'Ease' },
    { value: 'ease-in', label: 'Ease in' },
    { value: 'ease-out', label: 'Ease out' },
    { value: 'ease-in-out', label: 'Ease in-out' },
    { value: 'step-start', label: 'Step start' },
    { value: 'step-end', label: 'Step end' },
];

function AllPreset() {
    const setter = useStyleSetter('transition');
    return (
        <div className="flex justify-end px-3 pb-1">
            <Button
                size="sm"
                variant="ghost"
                onClick={() => setter.set('all 200ms ease')}
                className="h-6 text-[11px]"
            >
                Apply "all 200ms ease"
            </Button>
        </div>
    );
}

export const TransitionsSection = observer(function TransitionsSection() {
    const props = [
        useStyleValue('transition'),
        useStyleValue('transition-property'),
        useStyleValue('transition-duration'),
        useStyleValue('transition-timing-function'),
        useStyleValue('transition-delay'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="transitions" title="Transitions" setCount={setCount}>
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
                        placeholder="all | opacity, transform"
                    />
                )}
            </PropertyControl>
            <PropertyControl property="transition-duration" label="Duration">
                {({ value, commit }) => (
                    <NumberInput
                        compact
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
                    <NumberInput
                        compact
                        value={value}
                        onCommit={commit}
                        defaultUnit="ms"
                        units={['ms', 's']}
                    />
                )}
            </PropertyControl>
            <AllPreset />
        </Section>
    );
});
