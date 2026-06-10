'use client';

import { useMemo } from 'react';

import type { TailwindColor } from '@weblab/models/style';
import { Color } from '@weblab/utility';

import { ColorPickerContent } from '../../../editor-bar/inputs/color-picker';

function toHexString(c: Color | TailwindColor): string {
    // `||` (not `??`): an empty `lightColor` is not a valid CSS color either,
    // and must fall back to black rather than be propagated to `onCommit`.
    return c instanceof Color ? c.toHex() : c.lightColor || '#000000';
}

export interface ColorPickerInlineProps {
    /** Current color string (hex, rgb, rgba). */
    value: string;
    /** Called on every drag tick and on release. */
    onCommit: (value: string) => void;
}

/**
 * The full color picker (gradient area + hue/alpha sliders + palette),
 * rendered directly inside ColorRow's popover — the picker is one click
 * away from the swatch, with no intermediate trigger row in between.
 */
export function ColorPickerInline({ value, onCommit }: ColorPickerInlineProps) {
    // Memoize on `value` — otherwise `ColorPickerContent` receives a fresh
    // Color reference every render and resets internal HSV state mid-drag.
    const safeColor = useMemo(() => {
        try {
            return Color.from(value || '#00000000');
        } catch {
            return Color.from('#00000000');
        }
    }, [value]);

    return (
        <ColorPickerContent
            color={safeColor}
            onChange={(c) => onCommit(toHexString(c))}
            onChangeEnd={(c) => onCommit(toHexString(c))}
        />
    );
}
