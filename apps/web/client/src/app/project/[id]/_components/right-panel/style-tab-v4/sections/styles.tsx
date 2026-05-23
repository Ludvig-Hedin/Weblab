'use client';

import { observer } from 'mobx-react-lite';

import { GroupShell, IconSegment, SliderField } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const VISIBLE_OPTIONS = [
    {
        value: 'visible',
        label: 'Visible',
        icon: <span className="text-mini">Yes</span>,
    },
    {
        value: 'hidden',
        label: 'Hidden',
        icon: <span className="text-mini">No</span>,
    },
] as const;

/**
 * Styles section — opacity slider + visibility yes/no toggle.
 * Both ported to v4 grammar: GroupShell wrapping each control,
 * section content in `flex flex-col gap-3 px-3 pb-3`.
 */
export const StylesSection = observer(function StylesSection() {
    const opacity = useStyleValue('opacity');
    const visibility = useStyleValue('visibility');
    const opacitySetter = useStyleSetter('opacity');
    const visibilitySetter = useStyleSetter('visibility');

    return (
        <Section id="styles" title="Styles">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label="Opacity" onReset={() => opacitySetter.set('')}>
                    <SliderField
                        value={opacity.value}
                        onCommit={opacitySetter.set}
                        min={0}
                        max={100}
                        suffix="%"
                        asPercent
                    />
                </GroupShell>

                <GroupShell label="Visible" onReset={() => visibilitySetter.set('')}>
                    <IconSegment
                        value={visibility.value || 'visible'}
                        options={VISIBLE_OPTIONS}
                        onCommit={visibilitySetter.set}
                        ariaLabel="Visibility"
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
