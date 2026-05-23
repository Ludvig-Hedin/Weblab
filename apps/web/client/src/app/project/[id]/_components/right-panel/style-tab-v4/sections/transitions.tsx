'use client';

import { observer } from 'mobx-react-lite';

import { GroupShell, IconNumberInput, LabeledSelectInput, LabeledTextInput } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const TIMING_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'ease', label: 'Ease' },
    { value: 'ease-in', label: 'Ease in' },
    { value: 'ease-out', label: 'Ease out' },
    { value: 'ease-in-out', label: 'Ease in-out' },
] as const;

const TIME_UNITS = ['ms', 's'] as const;

/**
 * Transitions section — shorthand + four longhands. Each row is a GroupShell
 * wrapping a v4 primitive; ported from v3 PropertyControl grammar.
 */
export const TransitionsSection = observer(function TransitionsSection() {
    const transition = useStyleValue('transition');
    const transitionProperty = useStyleValue('transition-property');
    const transitionDuration = useStyleValue('transition-duration');
    const transitionTiming = useStyleValue('transition-timing-function');
    const transitionDelay = useStyleValue('transition-delay');

    const transitionSetter = useStyleSetter('transition');
    const transitionPropertySetter = useStyleSetter('transition-property');
    const transitionDurationSetter = useStyleSetter('transition-duration');
    const transitionTimingSetter = useStyleSetter('transition-timing-function');
    const transitionDelaySetter = useStyleSetter('transition-delay');

    return (
        <Section id="transitions" title="Transitions">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label="Shorthand" onReset={() => transitionSetter.set('')}>
                    <LabeledTextInput
                        label="Value"
                        value={transition.value}
                        onCommit={transitionSetter.set}
                        placeholder="all 200ms ease"
                    />
                </GroupShell>

                <GroupShell label="Property" onReset={() => transitionPropertySetter.set('')}>
                    <LabeledTextInput
                        label="Prop"
                        value={transitionProperty.value}
                        onCommit={transitionPropertySetter.set}
                        placeholder="all"
                    />
                </GroupShell>

                <GroupShell label="Duration" onReset={() => transitionDurationSetter.set('')}>
                    <IconNumberInput
                        value={transitionDuration.value}
                        onCommit={transitionDurationSetter.set}
                        units={TIME_UNITS}
                        defaultUnit="ms"
                        placeholder="200ms"
                        aria-label="Transition duration"
                    />
                </GroupShell>

                <GroupShell label="Easing" onReset={() => transitionTimingSetter.set('')}>
                    <LabeledSelectInput
                        label="Ease"
                        value={transitionTiming.value}
                        options={TIMING_OPTIONS}
                        onCommit={transitionTimingSetter.set}
                    />
                </GroupShell>

                <GroupShell label="Delay" onReset={() => transitionDelaySetter.set('')}>
                    <IconNumberInput
                        value={transitionDelay.value}
                        onCommit={transitionDelaySetter.set}
                        units={TIME_UNITS}
                        defaultUnit="ms"
                        placeholder="0ms"
                        aria-label="Transition delay"
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
