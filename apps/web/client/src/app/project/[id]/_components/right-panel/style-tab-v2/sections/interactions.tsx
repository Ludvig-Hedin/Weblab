'use client';

import { MousePointerClick } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
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
];

const POINTER_EVENTS_OPTIONS = [
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

const SCROLL_BEHAVIOR_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'smooth', label: 'Smooth' },
];

export const CursorInputSection = observer(function CursorInputSection() {
    const props = [
        useStyleValue('cursor'),
        useStyleValue('pointer-events'),
        useStyleValue('user-select'),
        useStyleValue('touch-action'),
        useStyleValue('scroll-behavior'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section
            id="cursor-input"
            title="Cursor & input"
            icon={MousePointerClick}
            setCount={setCount}
        >
            <PropertyControl property="cursor" label="Cursor">
                {({ value, commit }) => (
                    <SelectField value={value} options={CURSOR_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="pointer-events" label="Pointer">
                {({ value, commit }) => (
                    <SelectField value={value} options={POINTER_EVENTS_OPTIONS} onCommit={commit} />
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
            <PropertyControl property="scroll-behavior" label="Scroll">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={SCROLL_BEHAVIOR_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
        </Section>
    );
});
