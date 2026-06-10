'use client';

import { useEffect, useState } from 'react';

import type { TailwindColor } from '@weblab/models/style';
import { Color } from '@weblab/utility';

import { ColorPickerContent } from '../../../editor-bar/inputs/color-picker';

function toHexString(c: Color | TailwindColor): string {
    // `||` (not `??`): an empty `lightColor` is not a valid CSS color either,
    // and must fall back to black rather than be propagated to `onCommit`.
    return c instanceof Color ? c.toHex() : c.lightColor || '#000000';
}

function safeColor(value: string): Color {
    try {
        return Color.from(value || '#00000000');
    } catch {
        return Color.from('#00000000');
    }
}

export interface ColorPickerInlineProps {
    /** Current color string (hex, rgb, rgba). */
    value: string;
    /** Called once per gesture, on release / selection. */
    onCommit: (value: string) => void;
}

/**
 * The full color picker (gradient area + hue/alpha sliders + palette),
 * rendered directly inside ColorRow's popover — the picker is one click
 * away from the swatch, with no intermediate trigger row in between.
 *
 * Drag performance: `onChange` (fires per pointer-move) only updates LOCAL
 * picker state; the engine write — history entry, responsive fan-out,
 * iframe injection, debounced AST write — happens once per gesture via
 * `onChangeEnd`. Writing on every tick made color dragging visibly laggy.
 * Same pattern as the editor-bar's `useColorUpdate` (tempColor + commit-end).
 */
export function ColorPickerInline({ value, onCommit }: ColorPickerInlineProps) {
    const [tempColor, setTempColor] = useState<Color>(() => safeColor(value));

    // Re-sync when the committed value changes from outside (selection change,
    // undo, another control writing the same property).
    useEffect(() => {
        setTempColor(safeColor(value));
    }, [value]);

    return (
        <ColorPickerContent
            color={tempColor}
            onChange={(c) => {
                setTempColor(c instanceof Color ? c : safeColor(c.lightColor));
            }}
            onChangeEnd={(c) => {
                const hex = toHexString(c);
                setTempColor(safeColor(hex));
                onCommit(hex);
            }}
        />
    );
}
