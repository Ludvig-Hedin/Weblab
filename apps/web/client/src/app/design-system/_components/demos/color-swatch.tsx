'use client';

import { useRef } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { hexToHsl, hslToHex } from '../color-utils';
import { useOverrides } from '../overrides-context';

export function ColorSwatch({
    name,
    cssVar,
    value,
}: {
    name: string;
    cssVar: string;
    value: string;
}) {
    const { overrides, setToken, resetToken } = useOverrides();
    const current = overrides[cssVar] ?? value;
    const isEdited = overrides[cssVar] !== undefined;
    const inputRef = useRef<HTMLInputElement>(null);
    const hex = hslToHex(current);

    return (
        <div className="group/swatch flex min-w-0 items-center gap-2.5">
            <div
                className={cn(
                    'border-border relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded border',
                )}
                onClick={() => inputRef.current?.click()}
                title={`Edit ${name}`}
            >
                <div className="h-full w-full" style={{ background: `hsl(${current})` }} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/swatch:opacity-100">
                    <Icons.Pencil className="h-3 w-3 text-white" />
                </div>
                <input
                    ref={inputRef}
                    type="color"
                    value={hex}
                    onChange={(e) => setToken(cssVar, hexToHsl(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                {isEdited && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            resetToken(cssVar);
                        }}
                        className="absolute -top-1 -right-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-black hover:bg-amber-300"
                        title="Reset to default"
                    >
                        ×
                    </button>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-foreground truncate text-xs leading-tight font-medium">{name}</p>
                <p className="text-foreground-tertiary truncate font-mono text-[10px] leading-tight">
                    {cssVar}
                </p>
                <p
                    className={cn(
                        'truncate font-mono text-[10px] leading-tight',
                        isEdited ? 'text-amber-400' : 'text-foreground-tertiary opacity-60',
                    )}
                >
                    {hex}
                </p>
            </div>
        </div>
    );
}
