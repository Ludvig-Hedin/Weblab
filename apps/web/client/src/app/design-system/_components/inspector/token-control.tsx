'use client';

import { useRef } from 'react';

import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Slider } from '@weblab/ui/slider';
import { cn } from '@weblab/ui/utils';

import type { ComponentTokenSpec } from './component-tokens';
import { hexToHsl, hslToHex } from '../color-utils';
import { useOverrides } from '../overrides-context';

export function TokenControl({ spec }: { spec: ComponentTokenSpec }) {
    const { overrides, setToken, resetToken } = useOverrides();
    const current = overrides[spec.cssVar] ?? spec.defaultValue;
    const isEdited = overrides[spec.cssVar] !== undefined;

    return (
        <div
            className={cn(
                'border-border rounded-lg border p-3 transition-colors',
                isEdited && 'border-l-2 border-l-amber-400/60',
            )}
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <Label className="text-foreground text-xs font-medium">{spec.label}</Label>
                    <p className="text-foreground-tertiary truncate font-mono text-[10px]">
                        {spec.cssVar}
                    </p>
                </div>
                {isEdited && (
                    <button
                        onClick={() => resetToken(spec.cssVar)}
                        className="text-foreground-tertiary hover:text-foreground text-[10px] transition-colors"
                        title="Reset to default"
                    >
                        reset
                    </button>
                )}
            </div>

            {spec.kind === 'color' && (
                <ColorControl
                    cssVar={spec.cssVar}
                    value={current}
                    onChange={(v) => setToken(spec.cssVar, v)}
                />
            )}
            {spec.kind === 'radius' && (
                <RadiusControl
                    value={current}
                    onChange={(v) => setToken(spec.cssVar, v)}
                />
            )}
            {(spec.kind === 'spacing' || spec.kind === 'number') && (
                <TextControl
                    value={current}
                    placeholder="e.g. 0.5rem"
                    onChange={(v) => setToken(spec.cssVar, v)}
                />
            )}
            {(spec.kind === 'shadow' || spec.kind === 'text') && (
                <TextControl
                    value={current}
                    placeholder={spec.defaultValue}
                    onChange={(v) => setToken(spec.cssVar, v)}
                />
            )}

            {spec.hint && (
                <p className="text-foreground-tertiary mt-2 text-[10px] italic">{spec.hint}</p>
            )}
        </div>
    );
}

function ColorControl({
    cssVar,
    value,
    onChange,
}: {
    cssVar: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const hex = hslToHex(value);

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => inputRef.current?.click()}
                className="border-border relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded border"
                title={`Edit ${cssVar}`}
            >
                <div className="h-full w-full" style={{ background: `hsl(${value})` }} />
                <input
                    ref={inputRef}
                    type="color"
                    value={hex}
                    onChange={(e) => onChange(hexToHsl(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </button>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 flex-1 font-mono text-[11px]"
                spellCheck={false}
            />
            <span className="text-foreground-tertiary w-14 font-mono text-[10px]">{hex}</span>
        </div>
    );
}

function RadiusControl({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    const numeric = parseFloat(value);
    const safe = Number.isFinite(numeric) ? numeric : 1;

    return (
        <div className="flex items-center gap-2">
            <Slider
                value={[safe]}
                onValueChange={([v]) => onChange(`${(v ?? 0).toFixed(2)}rem`)}
                min={0}
                max={3}
                step={0.05}
                className="flex-1"
            />
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 w-20 font-mono text-[11px]"
                spellCheck={false}
            />
            <Icons.CornerBottomLeft className="text-foreground-tertiary h-3.5 w-3.5" />
        </div>
    );
}

function TextControl({
    value,
    placeholder,
    onChange,
}: {
    value: string;
    placeholder: string;
    onChange: (v: string) => void;
}) {
    return (
        <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-8 font-mono text-[11px]"
            spellCheck={false}
        />
    );
}
