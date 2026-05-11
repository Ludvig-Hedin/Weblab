'use client';

import { Section } from '../section';
import { SPACING_DATA } from './data';

export function SpacingDemo() {
    return (
        <div id="spacing">
            <Section title="Spacing scale" tag="spacing">
                <div className="flex flex-wrap items-end gap-2">
                    {SPACING_DATA.map((n) => (
                        <div key={n} className="flex flex-col items-center gap-1">
                            <div
                                className="bg-foreground/20 rounded-sm"
                                style={{ width: `${n * 4}px`, height: `${n * 4}px` }}
                            />
                            <p className="text-foreground-tertiary font-mono text-[10px]">{n}</p>
                            <p className="text-foreground-tertiary font-mono text-[10px] opacity-60">
                                {n * 4}px
                            </p>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
