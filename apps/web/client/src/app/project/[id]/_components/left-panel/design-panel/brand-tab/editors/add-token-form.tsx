'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';

import type { TokenSectionId } from '../lib/group-tokens';
import { useEditorEngine } from '@/components/store/editor';
import { newTokenName, slugify } from '../lib/token-mutations';

const VALUE_PLACEHOLDER: Record<TokenSectionId, string> = {
    colors: '#3b82f6 or var(--color-blue-600)',
    sizes: '1rem',
    radius: '8px',
    'text-styles': 'font-sans font-normal text-base leading-normal',
    other: 'value',
};

export interface AddTokenFormProps {
    sectionId: TokenSectionId;
    onClose: () => void;
}

/**
 * Inline "add token" form opened from a section's `+`. One name + one value —
 * the rest is progressive. A literal value creates a plain variable; a
 * `var(--…)` value in the Colors section round-trips into a Color Style on the
 * next scan (the data layer treats them the same).
 */
export const AddTokenForm = observer(function AddTokenForm({
    sectionId,
    onClose,
}: AddTokenFormProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const isTextStyle = sectionId === 'text-styles';
    const [name, setName] = useState('');
    const [value, setValue] = useState(isTextStyle ? VALUE_PLACEHOLDER['text-styles'] : '');
    const [busy, setBusy] = useState(false);
    const nameRef = useRef<HTMLInputElement | null>(null);

    // Focus the Name field when the form opens. Ref+effect instead of the
    // `autoFocus` prop so we don't trip the `jsx-a11y/no-autofocus` warning.
    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const canSubmit = slugify(name.trim()).length > 0 && value.trim().length > 0 && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
            if (isTextStyle) {
                await tokens.addTextStyle({
                    name: slugify(name),
                    applyClasses: value.split(/\s+/).filter(Boolean),
                });
            } else {
                await tokens.addVariable({
                    name: newTokenName(sectionId, name),
                    light: value.trim(),
                });
            }
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add token';
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-background-secondary border-border mx-2 mb-1 flex flex-col gap-2 rounded-md border p-2.5">
            <div className="flex flex-col gap-1">
                <Label className="text-micro text-foreground-secondary">Name</Label>
                <Input
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={sectionId === 'colors' ? 'brand-primary' : 'name'}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit();
                    }}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-micro text-foreground-secondary">
                    {isTextStyle ? 'Apply classes' : 'Value'}
                </Label>
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={VALUE_PLACEHOLDER[sectionId]}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void submit();
                    }}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex items-center justify-end gap-2 pt-0.5">
                <Button variant="ghost" size="sm" className="h-7" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    className="h-7"
                    disabled={!canSubmit}
                    onClick={() => void submit()}
                >
                    {busy ? 'Adding…' : 'Add'}
                </Button>
            </div>
        </div>
    );
});
