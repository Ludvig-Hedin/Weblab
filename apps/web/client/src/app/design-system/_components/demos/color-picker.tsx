'use client';

import { useState } from 'react';

import { ColorPicker } from '@weblab/ui/color-picker';
import { Color } from '@weblab/utility';

import { Section } from '../section';

export function ColorPickerDemo() {
    const [color, setColor] = useState<Color>(() => Color.from('#7c3aed'));

    return (
        <Section
            title="Color picker"
            tag="color-picker"
            inspectId="color-picker"
            filePath="packages/ui/src/components/color-picker"
            id="color-picker"
        >
            <div className="flex flex-wrap gap-6">
                <div className="border-border w-72 rounded-xl border p-4">
                    <ColorPicker color={color} onChange={setColor} onChangeEnd={setColor} />
                </div>
                <div className="space-y-2">
                    <p className="text-foreground-tertiary text-xs">Current</p>
                    <div
                        className="border-border h-24 w-32 rounded-md border"
                        style={{ background: color.toHex() }}
                    />
                    <p className="text-foreground-tertiary font-mono text-xs">{color.toHex()}</p>
                </div>
            </div>
        </Section>
    );
}
