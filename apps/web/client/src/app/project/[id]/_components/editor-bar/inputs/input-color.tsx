'use client';

import { useCallback, useRef, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { Color } from '@weblab/utility';

import { useColorUpdate } from '../hooks/use-color-update';
import { ColorPickerContent } from './color-picker';

interface InputColorProps {
    color: string;
    elementStyleKey: string;
    onColorChange?: (color: string) => void;
}

export const InputColor = ({ color, elementStyleKey, onColorChange }: InputColorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    // Raw text while the user is editing the hex field. `null` means "not
    // editing" → show the committed/preview color. Holding the raw string lets
    // the user type partial hex ("ff0") without the controlled value fighting
    // back, and — crucially — defers the source write to blur/Enter instead of
    // firing a full AST round-trip per keystroke (typing "ff00ff" was 6 writes).
    const [draft, setDraft] = useState<string | null>(null);
    // Synchronous mirror of `draft`. `commitDraft` runs from both the keydown
    // handler and the `blur()` that handler triggers — within one tick, before
    // React re-renders — so a state-based read would still see the old value:
    // Enter would commit twice and Escape would commit the value it should
    // discard. The ref is the source of truth for *what* to commit.
    const draftRef = useRef<string | null>(null);

    const setDraftValue = useCallback((value: string | null) => {
        draftRef.current = value;
        setDraft(value);
    }, []);

    const { handleColorUpdateEnd, handleColorUpdate, tempColor } = useColorUpdate({
        elementStyleKey,
        onValueChange: (_, value) => onColorChange?.(value),
        initialColor: color,
    });

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            setDraftValue(value);
            // Live preview only (local temp color) — no source write yet.
            // `Color.from` never throws; it falls back to transparent for
            // unparseable input, which would flash the element transparent on
            // every partial keystroke. `tryFrom` returns null instead — skip
            // the preview until the draft parses. Require ≥3 chars so a lone
            // "f" isn't expanded to #ffffff and previewed as white.
            const trimmed = value.trim();
            if (trimmed.length >= 3) {
                const parsed = Color.tryFrom(trimmed);
                if (parsed) {
                    handleColorUpdate(parsed);
                }
            }
        },
        [handleColorUpdate, setDraftValue],
    );

    const commitDraft = useCallback(() => {
        const current = draftRef.current;
        if (current === null) return;
        // Clear first so the blur() that Enter triggers — which re-invokes this
        // synchronously — sees null and no-ops instead of committing twice.
        draftRef.current = null;
        setDraft(null);
        // `handleColorUpdateEnd` already forwards the committed value to
        // `onColorChange` via the hook's `onValueChange` — don't call it
        // again here or the parent gets a duplicate update. Unparseable
        // entries ("redd") are dropped — `Color.from` would silently coerce
        // them to transparent and write that to the user's source.
        const parsed = Color.tryFrom(current.trim());
        if (parsed) {
            handleColorUpdateEnd(parsed);
        }
    }, [handleColorUpdateEnd]);

    const cancelDraft = useCallback(() => {
        draftRef.current = null;
        setDraft(null);
    }, []);

    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                commitDraft();
                e.currentTarget.blur();
            } else if (e.key === 'Escape') {
                // Discard — clear the ref BEFORE blur() so the blur-triggered
                // commitDraft sees null and doesn't write the discarded value.
                cancelDraft();
                e.currentTarget.blur();
            }
        },
        [commitDraft, cancelDraft],
    );

    return (
        <div className="flex h-9 w-full items-center">
            <div className="bg-background-tertiary/50 mr-[1px] flex h-full flex-1 items-center rounded-l-md px-3 py-1.5 pl-1.5">
                <Popover onOpenChange={setIsOpen}>
                    <PopoverTrigger>
                        <div className="flex items-center">
                            <div
                                className="mr-2 aspect-square h-5 w-5 rounded-sm"
                                style={{ backgroundColor: tempColor.toHex() }}
                                onClick={() => setIsOpen(!isOpen)}
                            />
                            <input
                                type="text"
                                value={draft ?? tempColor.toHex6()}
                                onChange={handleInputChange}
                                onBlur={commitDraft}
                                onKeyDown={handleInputKeyDown}
                                aria-label="Hex color"
                                className="text-foreground text-small h-full w-full bg-transparent focus:outline-none"
                            />
                        </div>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-[224px] overflow-hidden rounded-lg p-0 shadow-xl backdrop-blur-lg"
                        side="left"
                        align="start"
                        alignOffset={-24}
                    >
                        <ColorPickerContent
                            color={tempColor}
                            onChange={handleColorUpdate}
                            onChangeEnd={handleColorUpdateEnd}
                        />
                    </PopoverContent>
                </Popover>
            </div>
            <div className="text-foreground bg-background-tertiary/50 text-mini flex h-full items-center rounded-r-md px-3 py-1.5">
                {Math.round(tempColor.rgb.a * 100).toString()}%
            </div>
        </div>
    );
};
