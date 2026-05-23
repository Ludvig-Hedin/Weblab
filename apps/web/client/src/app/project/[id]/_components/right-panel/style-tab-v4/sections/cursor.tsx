'use client';

import { observer } from 'mobx-react-lite';

import { GroupShell, LabeledSelectInput } from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const CURSOR_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'default', label: 'Default' },
    { value: 'pointer', label: 'Pointer' },
    { value: 'wait', label: 'Wait' },
    { value: 'text', label: 'Text' },
    { value: 'move', label: 'Move' },
    { value: 'not-allowed', label: 'Not allowed' },
    { value: 'grab', label: 'Grab' },
    { value: 'grabbing', label: 'Grabbing' },
    { value: 'crosshair', label: 'Crosshair' },
    { value: 'help', label: 'Help' },
    { value: 'zoom-in', label: 'Zoom in' },
    { value: 'zoom-out', label: 'Zoom out' },
] as const;

const POINTER_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
] as const;

const USER_SELECT_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
    { value: 'text', label: 'Text' },
    { value: 'all', label: 'All' },
    { value: 'contain', label: 'Contain' },
] as const;

const TOUCH_ACTION_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
    { value: 'pan-x', label: 'Pan X' },
    { value: 'pan-y', label: 'Pan Y' },
    { value: 'pinch-zoom', label: 'Pinch zoom' },
    { value: 'manipulation', label: 'Manipulation' },
] as const;

/**
 * Cursor section — pointer ergonomics. Four select rows each wrapped in
 * GroupShell, ported to v4 grammar (LabeledSelectInput inside GroupShell).
 */
export const CursorSection = observer(function CursorSection() {
    const cursor = useStyleValue('cursor');
    const pointerEvents = useStyleValue('pointer-events');
    const userSelect = useStyleValue('user-select');
    const touchAction = useStyleValue('touch-action');

    const cursorSetter = useStyleSetter('cursor');
    const pointerEventsSetter = useStyleSetter('pointer-events');
    const userSelectSetter = useStyleSetter('user-select');
    const touchActionSetter = useStyleSetter('touch-action');

    return (
        <Section id="cursor" title="Cursor">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <GroupShell label="Cursor" onReset={() => cursorSetter.set('')}>
                    <LabeledSelectInput
                        label="Type"
                        value={cursor.value}
                        options={CURSOR_OPTIONS}
                        onCommit={cursorSetter.set}
                    />
                </GroupShell>

                <GroupShell label="Pointer events" onReset={() => pointerEventsSetter.set('')}>
                    <LabeledSelectInput
                        label="Events"
                        value={pointerEvents.value}
                        options={POINTER_OPTIONS}
                        onCommit={pointerEventsSetter.set}
                    />
                </GroupShell>

                <GroupShell label="User select" onReset={() => userSelectSetter.set('')}>
                    <LabeledSelectInput
                        label="Select"
                        value={userSelect.value}
                        options={USER_SELECT_OPTIONS}
                        onCommit={userSelectSetter.set}
                    />
                </GroupShell>

                <GroupShell label="Touch action" onReset={() => touchActionSetter.set('')}>
                    <LabeledSelectInput
                        label="Touch"
                        value={touchAction.value}
                        options={TOUCH_ACTION_OPTIONS}
                        onCommit={touchActionSetter.set}
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
