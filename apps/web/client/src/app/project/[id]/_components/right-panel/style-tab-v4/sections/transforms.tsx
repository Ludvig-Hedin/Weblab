'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { CustomExpander, GroupShell, LabeledTextInput, SliderField } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/**
 * Transforms section — Perspective + Rotate sliders surface up top per the
 * Figma. Custom expander reveals raw `transform`, `transform-origin`,
 * `perspective-origin`, `transform-style`, `backface-visibility`.
 * Ported to v4 grammar: GroupShell wrapping each row, content in gap-3 wrapper.
 */
export const TransformsSection = observer(function TransformsSection() {
    const perspective = useStyleValue('perspective');
    const rotate = useStyleValue('rotate');
    const transform = useStyleValue('transform');
    const transformOrigin = useStyleValue('transform-origin');
    const perspectiveOrigin = useStyleValue('perspective-origin');
    const transformStyle = useStyleValue('transform-style');
    const backfaceVisibility = useStyleValue('backface-visibility');

    const perspectiveSetter = useStyleSetter('perspective');
    const rotateSetter = useStyleSetter('rotate');
    const transformSetter = useStyleSetter('transform');
    const transformOriginSetter = useStyleSetter('transform-origin');
    const perspectiveOriginSetter = useStyleSetter('perspective-origin');
    const transformStyleSetter = useStyleSetter('transform-style');
    const backfaceVisibilitySetter = useStyleSetter('backface-visibility');

    const advancedSetCount = [
        transform,
        transformOrigin,
        perspectiveOrigin,
        transformStyle,
        backfaceVisibility,
    ].filter((v) => v.isSet).length;

    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    return (
        <Section id="transforms" title="Transforms">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label="Perspective" onReset={() => perspectiveSetter.set('')}>
                    <SliderField
                        value={perspective.value}
                        onCommit={perspectiveSetter.set}
                        min={0}
                        max={2400}
                        suffix=""
                    />
                </GroupShell>

                <GroupShell label="Rotate" onReset={() => rotateSetter.set('')}>
                    <SliderField
                        value={rotate.value}
                        onCommit={rotateSetter.set}
                        min={0}
                        max={360}
                        suffix="°"
                    />
                </GroupShell>

                <CustomExpander
                    open={customOpen}
                    onOpenChange={setCustomOpen}
                    summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
                >
                    <GroupShell label="Transform" onReset={() => transformSetter.set('')}>
                        <LabeledTextInput
                            label="Value"
                            value={transform.value}
                            onCommit={transformSetter.set}
                            placeholder="translate(0,0) scale(1)"
                        />
                    </GroupShell>

                    <GroupShell label="Origin" onReset={() => transformOriginSetter.set('')}>
                        <LabeledTextInput
                            label="Value"
                            value={transformOrigin.value}
                            onCommit={transformOriginSetter.set}
                            placeholder="center center"
                        />
                    </GroupShell>

                    <GroupShell
                        label="Perspective origin"
                        onReset={() => perspectiveOriginSetter.set('')}
                    >
                        <LabeledTextInput
                            label="Value"
                            value={perspectiveOrigin.value}
                            onCommit={perspectiveOriginSetter.set}
                            placeholder="50% 50%"
                        />
                    </GroupShell>

                    <GroupShell label="Style" onReset={() => transformStyleSetter.set('')}>
                        <LabeledTextInput
                            label="Value"
                            value={transformStyle.value}
                            onCommit={transformStyleSetter.set}
                            placeholder="flat | preserve-3d"
                        />
                    </GroupShell>

                    <GroupShell
                        label="Backface visibility"
                        onReset={() => backfaceVisibilitySetter.set('')}
                    >
                        <LabeledTextInput
                            label="Value"
                            value={backfaceVisibility.value}
                            onCommit={backfaceVisibilitySetter.set}
                            placeholder="visible | hidden"
                        />
                    </GroupShell>
                </CustomExpander>
            </div>
        </Section>
    );
});
