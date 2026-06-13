'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { GroupShell, LabeledSelectInput } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

/**
 * Cursor section — pointer ergonomics. Four select rows each wrapped in
 * GroupShell, ported to v4 grammar (LabeledSelectInput inside GroupShell).
 */
export const CursorSection = observer(function CursorSection() {
    const t = useTranslations('editor.stylePanel');

    const CURSOR_OPTIONS = [
        { value: 'auto', label: t('cursor.auto') },
        { value: 'default', label: t('cursor.default') },
        { value: 'pointer', label: t('cursor.pointer') },
        { value: 'wait', label: t('cursor.wait') },
        { value: 'text', label: t('cursor.text') },
        { value: 'move', label: t('cursor.move') },
        { value: 'not-allowed', label: t('cursor.notAllowed') },
        { value: 'grab', label: t('cursor.grab') },
        { value: 'grabbing', label: t('cursor.grabbing') },
        { value: 'crosshair', label: t('cursor.crosshair') },
        { value: 'help', label: t('cursor.help') },
        { value: 'zoom-in', label: t('cursor.zoomIn') },
        { value: 'zoom-out', label: t('cursor.zoomOut') },
    ] as const;

    const POINTER_OPTIONS = [
        { value: 'auto', label: t('cursor.auto') },
        { value: 'none', label: t('cursor.none') },
    ] as const;

    const USER_SELECT_OPTIONS = [
        { value: 'auto', label: t('cursor.auto') },
        { value: 'none', label: t('cursor.none') },
        { value: 'text', label: t('cursor.text') },
        { value: 'all', label: t('cursor.all') },
        { value: 'contain', label: t('cursor.contain') },
    ] as const;

    const TOUCH_ACTION_OPTIONS = [
        { value: 'auto', label: t('cursor.auto') },
        { value: 'none', label: t('cursor.none') },
        { value: 'pan-x', label: t('cursor.panX') },
        { value: 'pan-y', label: t('cursor.panY') },
        { value: 'pinch-zoom', label: t('cursor.pinchZoom') },
        { value: 'manipulation', label: t('cursor.manipulation') },
    ] as const;
    const cursor = useStyleValue('cursor');
    const pointerEvents = useStyleValue('pointer-events');
    const userSelect = useStyleValue('user-select');
    const touchAction = useStyleValue('touch-action');

    const cursorSetter = useStyleSetter('cursor');
    const pointerEventsSetter = useStyleSetter('pointer-events');
    const userSelectSetter = useStyleSetter('user-select');
    const touchActionSetter = useStyleSetter('touch-action');

    return (
        <Section id="cursor" title={t('section.cursor')}>
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label={t('cursor.cursor')} onReset={() => cursorSetter.set('')}>
                    <LabeledSelectInput
                        label={t('cursor.type')}
                        value={cursor.value}
                        options={CURSOR_OPTIONS}
                        onCommit={cursorSetter.set}
                    />
                </GroupShell>

                <GroupShell label={t('cursor.pointerEvents')} onReset={() => pointerEventsSetter.set('')}>
                    <LabeledSelectInput
                        label={t('cursor.events')}
                        value={pointerEvents.value}
                        options={POINTER_OPTIONS}
                        onCommit={pointerEventsSetter.set}
                    />
                </GroupShell>

                <GroupShell label={t('cursor.userSelect')} onReset={() => userSelectSetter.set('')}>
                    <LabeledSelectInput
                        label={t('cursor.select')}
                        value={userSelect.value}
                        options={USER_SELECT_OPTIONS}
                        onCommit={userSelectSetter.set}
                    />
                </GroupShell>

                <GroupShell label={t('cursor.touchAction')} onReset={() => touchActionSetter.set('')}>
                    <LabeledSelectInput
                        label={t('cursor.touch')}
                        value={touchAction.value}
                        options={TOUCH_ACTION_OPTIONS}
                        onCommit={touchActionSetter.set}
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
