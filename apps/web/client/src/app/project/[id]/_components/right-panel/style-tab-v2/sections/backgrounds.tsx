'use client';

import { Image as ImageIcon } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { ColorField } from '../controls/color-field';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const BACKGROUND_CLIP_OPTIONS = [
    { value: 'border-box', label: 'Border box' },
    { value: 'padding-box', label: 'Padding box' },
    { value: 'content-box', label: 'Content box' },
    { value: 'text', label: 'Text' },
];

const BACKGROUND_REPEAT_OPTIONS = [
    { value: 'repeat', label: 'Repeat' },
    { value: 'no-repeat', label: 'No repeat' },
    { value: 'repeat-x', label: 'Repeat X' },
    { value: 'repeat-y', label: 'Repeat Y' },
    { value: 'space', label: 'Space' },
    { value: 'round', label: 'Round' },
];

const BACKGROUND_SIZE_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: '100% 100%', label: 'Stretch' },
];

const BACKGROUND_POSITION_OPTIONS = [
    { value: 'center', label: 'Center' },
    { value: 'top', label: 'Top' },
    { value: 'right', label: 'Right' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'left', label: 'Left' },
    { value: 'top left', label: 'Top left' },
    { value: 'top right', label: 'Top right' },
    { value: 'bottom left', label: 'Bottom left' },
    { value: 'bottom right', label: 'Bottom right' },
];

export const BackgroundsSection = observer(function BackgroundsSection() {
    const props = [
        useStyleValue('background-color'),
        useStyleValue('background-image'),
        useStyleValue('background-size'),
        useStyleValue('background-position'),
        useStyleValue('background-repeat'),
        useStyleValue('background-clip'),
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="backgrounds" title="Backgrounds" icon={ImageIcon} setCount={setCount}>
            <PropertyControl property="background-color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="background-image" label="Image">
                {({ value, commit }) => (
                    <TextField
                        value={value}
                        onCommit={commit}
                        placeholder='url("...") or linear-gradient(...)'
                    />
                )}
            </PropertyControl>
            <PropertyControl property="background-size" label="Size">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={BACKGROUND_SIZE_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="background-position" label="Position">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={BACKGROUND_POSITION_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="background-repeat" label="Repeat">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={BACKGROUND_REPEAT_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
            <PropertyControl property="background-clip" label="Clip">
                {({ value, commit }) => (
                    <SelectField
                        value={value}
                        options={BACKGROUND_CLIP_OPTIONS}
                        onCommit={commit}
                    />
                )}
            </PropertyControl>
        </Section>
    );
});
