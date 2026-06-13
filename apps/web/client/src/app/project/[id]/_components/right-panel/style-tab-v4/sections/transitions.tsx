'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { GroupShell, IconNumberInput, LabeledSelectInput, LabeledTextInput } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// TIMING_OPTIONS defined inside TransitionsSection to use translations

const TIME_UNITS = ['ms', 's'] as const;

/**
 * Transitions section — shorthand + four longhands. Each row is a GroupShell
 * wrapping a v4 primitive; ported from v3 PropertyControl grammar.
 */
export const TransitionsSection = observer(function TransitionsSection() {
    const t = useTranslations('editor.stylePanel');

    const TIMING_OPTIONS = [
        { value: 'linear', label: t('transitions.linear') },
        { value: 'ease', label: t('transitions.ease') },
        { value: 'ease-in', label: t('transitions.easeIn') },
        { value: 'ease-out', label: t('transitions.easeOut') },
        { value: 'ease-in-out', label: t('transitions.easeInOut') },
    ] as const;

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
        <Section id="transitions" title={t('section.transitions')}>
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label={t('transitions.shorthand')} onReset={() => transitionSetter.set('')}>
                    <LabeledTextInput
                        label={t('transitions.value')}
                        value={transition.value}
                        onCommit={transitionSetter.set}
                        placeholder="all 200ms ease"
                    />
                </GroupShell>

                <GroupShell label={t('transitions.property')} onReset={() => transitionPropertySetter.set('')}>
                    <LabeledTextInput
                        label={t('transitions.prop')}
                        value={transitionProperty.value}
                        onCommit={transitionPropertySetter.set}
                        placeholder="all"
                    />
                </GroupShell>

                <GroupShell label={t('transitions.duration')} onReset={() => transitionDurationSetter.set('')}>
                    <IconNumberInput
                        value={transitionDuration.value}
                        onCommit={transitionDurationSetter.set}
                        units={TIME_UNITS}
                        defaultUnit="ms"
                        placeholder="200ms"
                        aria-label={t('transitions.transitionDuration')}
                    />
                </GroupShell>

                <GroupShell label={t('transitions.easing')} onReset={() => transitionTimingSetter.set('')}>
                    <LabeledSelectInput
                        label={t('transitions.ease')}
                        value={transitionTiming.value}
                        options={TIMING_OPTIONS}
                        onCommit={transitionTimingSetter.set}
                    />
                </GroupShell>

                <GroupShell label={t('transitions.delay')} onReset={() => transitionDelaySetter.set('')}>
                    <IconNumberInput
                        value={transitionDelay.value}
                        onCommit={transitionDelaySetter.set}
                        units={TIME_UNITS}
                        defaultUnit="ms"
                        placeholder="0ms"
                        aria-label={t('transitions.transitionDelay')}
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
