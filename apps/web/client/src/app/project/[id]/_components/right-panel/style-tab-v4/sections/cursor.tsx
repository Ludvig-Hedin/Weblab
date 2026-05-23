'use client';

import { observer } from 'mobx-react-lite';

import { PropertyControl, SelectField } from '../controls';
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
];

const POINTER_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
];

const USER_SELECT_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
    { value: 'text', label: 'Text' },
    { value: 'all', label: 'All' },
    { value: 'contain', label: 'Contain' },
];

const TOUCH_ACTION_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'none', label: 'None' },
    { value: 'pan-x', label: 'Pan X' },
    { value: 'pan-y', label: 'Pan Y' },
    { value: 'pinch-zoom', label: 'Pinch zoom' },
    { value: 'manipulation', label: 'Manipulation' },
];

/**
 * Cursor section — pointer ergonomics. Matches v2's Interactions section
 * behind a Figma-aligned name; everything is single-row Selects so this
 * stays compact.
 */
export const CursorSection = observer(function CursorSection() {
    return (
        <Section id="cursor" title="Cursor">
            <PropertyControl property="cursor" label="Cursor">
                {({ value, commit }) => (
                    <SelectField value={value} options={CURSOR_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="pointer-events" label="Pointer">
                {({ value, commit }) => (
                    <SelectField value={value} options={POINTER_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="user-select" label="Select">
                {({ value, commit }) => (
                    <SelectField value={value} options={USER_SELECT_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="touch-action" label="Touch">
                {({ value, commit }) => (
                    <SelectField value={value} options={TOUCH_ACTION_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
        </Section>
    );
});
