'use client';

import { observer } from 'mobx-react-lite';

import { IconToggleField, PropertyControl, SliderField } from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const VISIBLE_OPTIONS = [
    {
        value: 'visible',
        label: 'Yes',
        icon: <span className="text-mini">Yes</span>,
    },
    { value: 'hidden', label: 'No', icon: <span className="text-mini">No</span> },
];

/**
 * Styles section — the Figma's "Styles" group covers two opacity-class
 * properties only (opacity slider + visibility toggle). Everything else that
 * v2 grouped under "Effects" moves to a dedicated Effects section below.
 */
export const StylesSection = observer(function StylesSection() {
    const opacity = useStyleValue('opacity');
    const visibility = useStyleValue('visibility');
    const setCount = [opacity, visibility].filter((v) => v.isSet).length;

    return (
        <Section id="styles" title="Styles" setCount={setCount}>
            <PropertyControl property="opacity" label="Opacity">
                {({ value, commit }) => (
                    <SliderField
                        value={value}
                        onCommit={commit}
                        min={0}
                        max={100}
                        suffix="%"
                        asPercent
                    />
                )}
            </PropertyControl>
            <PropertyControl property="visibility" label="Visible">
                {({ value, isSet, commit }) => (
                    <IconToggleField
                        value={value}
                        isSet={isSet}
                        options={VISIBLE_OPTIONS}
                        onCommit={commit}
                        ariaLabel="Visibility"
                    />
                )}
            </PropertyControl>
        </Section>
    );
});
