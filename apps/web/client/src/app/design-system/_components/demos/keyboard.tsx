'use client';

import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { Kbd } from '@weblab/ui/kbd';

import { Section } from '../section';

export function KeyboardDemo() {
    return (
        <div id="keyboard">
            <Section
                title="Kbd"
                tag="keyboard"
                inspectId="kbd"
                filePath="packages/ui/src/components/kbd.tsx"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                    <span className="text-foreground-tertiary text-xs">
                        to open command palette
                    </span>
                    <Kbd>⇧</Kbd>
                    <Kbd>⌘</Kbd>
                    <Kbd>P</Kbd>
                    <span className="text-foreground-tertiary text-xs">to switch project</span>
                </div>
            </Section>

            <Section
                title="Hotkey label"
                tag="keyboard"
                inspectId="hotkey"
                filePath="packages/ui/src/components/hotkey-label.tsx"
            >
                <div className="flex flex-wrap items-center gap-4">
                    <HotkeyLabel
                        hotkey={{
                            command: 'mod+s',
                            description: 'Save',
                            readableCommand: '⌘ S',
                        }}
                    />
                    <HotkeyLabel
                        hotkey={{
                            command: 'mod+k',
                            description: 'Search',
                            readableCommand: '⌘ K',
                        }}
                    />
                    <HotkeyLabel
                        hotkey={{
                            command: 'mod+shift+l',
                            description: 'Toggle theme',
                            readableCommand: '⌘ ⇧ L',
                        }}
                    />
                </div>
            </Section>
        </div>
    );
}
