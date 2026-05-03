'use client';

import type { TailwindColor } from '@weblab/models/style';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { Color } from '@weblab/utility';

import { ColorPickerContent } from '../../../editor-bar/inputs/color-picker';

function toHexString(c: Color | TailwindColor): string {
    return c instanceof Color ? c.toHex() : (c.lightColor ?? '#000000');
}

export interface ColorFieldProps {
    /** Current color string (hex, rgb, rgba). */
    value: string;
    /** Called whenever the user picks a color (drag) or commits one (release). */
    onCommit: (value: string) => void;
    /** Optional placeholder shown when value is empty. */
    placeholder?: string;
}

/**
 * A compact color picker row used inside `<PropertyControl>`. Shows a swatch +
 * hex input that opens the existing `ColorPickerContent` popover from the
 * editor-bar. Empty values render a transparent checkerboard swatch to mirror
 * the convention used elsewhere in the panel.
 */
export function ColorField({ value, onCommit, placeholder = 'transparent' }: ColorFieldProps) {
    const isEmpty = !value;
    const safeColor = (() => {
        try {
            return Color.from(value || '#00000000');
        } catch {
            return Color.from('#00000000');
        }
    })();

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="border-input bg-background hover:border-ring/50 flex h-7 w-full items-center gap-2 rounded-md border px-2 text-xs"
                    aria-label="Open color picker"
                >
                    <span
                        aria-hidden
                        className="h-4 w-4 rounded-sm border border-black/10"
                        style={{
                            backgroundColor: isEmpty ? 'transparent' : safeColor.toHex(),
                            backgroundImage: isEmpty
                                ? 'linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)'
                                : undefined,
                            backgroundSize: '6px 6px',
                            backgroundPosition: '0 0,0 3px,3px -3px,-3px 0',
                        }}
                    />
                    <span className="truncate">{value || placeholder}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="left"
                align="start"
                alignOffset={-12}
                className="w-[224px] overflow-hidden rounded-lg p-0 shadow-xl backdrop-blur-lg"
            >
                <ColorPickerContent
                    color={safeColor}
                    onChange={(c) => onCommit(toHexString(c))}
                    onChangeEnd={(c) => onCommit(toHexString(c))}
                />
            </PopoverContent>
        </Popover>
    );
}
