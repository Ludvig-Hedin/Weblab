'use client';

import { Button } from '@weblab/ui/button';

export type WireframeMode = 'sitemap' | 'wireframe' | 'styleGuide' | 'design';

const MODES: Array<{ id: WireframeMode; label: string }> = [
    { id: 'sitemap', label: 'Sitemap' },
    { id: 'wireframe', label: 'Wireframe' },
    { id: 'styleGuide', label: 'Style Guide' },
    { id: 'design', label: 'Design' },
];

export function ModeSwitcher({
    mode,
    onChange,
    enabled,
}: {
    mode: WireframeMode;
    onChange: (mode: WireframeMode) => void;
    /** Modes that are reachable (e.g. wireframe locked until a sitemap exists). */
    enabled: Record<WireframeMode, boolean>;
}) {
    return (
        <div className="border-border bg-background inline-flex items-center gap-1 rounded-lg border p-1">
            {MODES.map((m) => (
                <Button
                    key={m.id}
                    variant={mode === m.id ? 'default' : 'ghost'}
                    size="sm"
                    disabled={!enabled[m.id]}
                    onClick={() => onChange(m.id)}
                >
                    {m.label}
                </Button>
            ))}
        </div>
    );
}
