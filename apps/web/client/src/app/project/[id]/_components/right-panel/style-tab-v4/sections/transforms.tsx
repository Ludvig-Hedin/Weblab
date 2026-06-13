'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

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
    const t = useTranslations('editor.stylePanel');
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

    // Auto-open when switching to an element that already has transforms set.
    useEffect(() => {
        if (advancedSetCount > 0) setCustomOpen(true);
    }, [advancedSetCount]);

    // Auto-close when switching to an element with no transforms set.
    useEffect(() => {
        if (advancedSetCount === 0) setCustomOpen(false);
    }, [advancedSetCount]);

    return (
        <Section id="transforms" title={t('section.transforms')}>
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label={t('transforms.perspective')} onReset={() => perspectiveSetter.set('')}>
                    <SliderField
                        value={perspective.value}
                        onCommit={perspectiveSetter.set}
                        min={0}
                        max={2400}
                        suffix=""
                    />
                </GroupShell>

                <GroupShell label={t('transforms.rotate')} onReset={() => rotateSetter.set('')}>
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
                    <GroupShell label={t('transforms.transform')} onReset={() => transformSetter.set('')}>
                        <LabeledTextInput
                            label={t('transforms.value')}
                            value={transform.value}
                            onCommit={transformSetter.set}
                            placeholder="translate(0,0) scale(1)"
                        />
                    </GroupShell>

                    <GroupShell label={t('transforms.origin')} onReset={() => transformOriginSetter.set('')}>
                        <LabeledTextInput
                            label={t('transforms.value')}
                            value={transformOrigin.value}
                            onCommit={transformOriginSetter.set}
                            placeholder="center center"
                        />
                    </GroupShell>

                    <GroupShell
                        label={t('transforms.perspectiveOrigin')}
                        onReset={() => perspectiveOriginSetter.set('')}
                    >
                        <LabeledTextInput
                            label={t('transforms.value')}
                            value={perspectiveOrigin.value}
                            onCommit={perspectiveOriginSetter.set}
                            placeholder="50% 50%"
                        />
                    </GroupShell>

                    <GroupShell label={t('transforms.transformStyle')} onReset={() => transformStyleSetter.set('')}>
                        <LabeledTextInput
                            label={t('transforms.value')}
                            value={transformStyle.value}
                            onCommit={transformStyleSetter.set}
                            placeholder="flat | preserve-3d"
                        />
                    </GroupShell>

                    <GroupShell
                        label={t('transforms.backfaceVisibility')}
                        onReset={() => backfaceVisibilitySetter.set('')}
                    >
                        <LabeledTextInput
                            label={t('transforms.value')}
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
