'use client';

import { useRef } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { tokenToHex } from '../color-utils';
import { useOverrides } from '../overrides-context';

interface ColorSwatchProps {
    name: string;
    cssVar: string;
    value: string;
    description?: string;
    usage?: string;
}

export function ColorSwatch({ name, cssVar, value, description, usage }: ColorSwatchProps) {
    const { overrides, setToken, resetToken } = useOverrides();
    const current = overrides[cssVar] ?? value;
    const isEdited = overrides[cssVar] !== undefined;
    const inputRef = useRef<HTMLInputElement>(null);
    const hex = tokenToHex(current);

    return (
        <div
            className={cn(
                'group/swatch border-border bg-foreground/[0.015] hover:border-foreground/20 relative flex min-w-0 flex-col gap-3 rounded-lg border p-3 transition-colors',
                isEdited && 'border-l-2 border-l-amber-400/60',
            )}
        >
            <div className="flex items-start gap-2.5">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="border-border relative h-9 w-9 flex-shrink-0 cursor-pointer overflow-hidden rounded border"
                    title={`Edit ${name}`}
                >
                    <span className="block h-full w-full" style={{ background: current }} />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/swatch:opacity-100">
                        <Icons.Pencil className="h-3 w-3 text-white" />
                    </span>
                    <input
                        ref={inputRef}
                        type="color"
                        value={hex}
                        onChange={(e) => setToken(cssVar, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`Pick color for ${cssVar}`}
                    />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-xs font-medium leading-tight">
                        {name}
                    </p>
                    <p className="text-foreground-tertiary truncate font-mono text-[10px] leading-tight">
                        {cssVar}
                    </p>
                    <p
                        className={cn(
                            'truncate font-mono text-[10px] leading-tight',
                            isEdited ? 'text-amber-400' : 'text-foreground-tertiary opacity-70',
                        )}
                    >
                        {hex.toUpperCase()}
                    </p>
                </div>
                {isEdited && (
                    <button
                        type="button"
                        onClick={() => resetToken(cssVar)}
                        className="text-foreground-tertiary hover:text-foreground absolute top-2 right-2 text-[10px]"
                        title="Reset to default"
                    >
                        reset
                    </button>
                )}
            </div>
            {(description || usage) && (
                <div className="border-border space-y-1.5 border-t pt-2.5">
                    {description && (
                        <p className="text-foreground-secondary text-[11px] leading-snug">
                            {description}
                        </p>
                    )}
                    {usage && (
                        <p className="text-foreground-tertiary font-mono text-[10px] leading-snug">
                            {usage}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
