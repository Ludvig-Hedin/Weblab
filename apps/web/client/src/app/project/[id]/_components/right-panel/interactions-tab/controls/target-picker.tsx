'use client';

import { useTranslations } from 'next-intl';

import type { Target, TargetKind } from '@weblab/models';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';

import { transKeys } from '@/i18n/keys';

interface TargetPickerProps {
    target: Target;
    onChange: (target: Target) => void;
}

const KINDS: TargetKind[] = ['self', 'sibling', 'child', 'class'];

export function TargetPicker({ target, onChange }: TargetPickerProps) {
    const t = useTranslations();

    const labels: Record<TargetKind, string> = {
        self: t(transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target.self),
        sibling: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target.sibling,
        ),
        child: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target.child,
        ),
        class: t(
            transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target.class,
        ),
        parent: 'Parent',
        'ix-id': 'IX',
    };

    return (
        <div className="flex flex-col gap-1.5 px-3 pb-2">
            <Label className="text-foreground-tertiary text-mini">
                {t(
                    transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target
                        .label,
                )}
            </Label>
            <ToggleGroup
                type="single"
                value={target.kind}
                onValueChange={(v) => {
                    if (!v) return;
                    onChange({ kind: v as TargetKind, value: target.value });
                }}
                className="grid grid-cols-4 gap-1"
            >
                {KINDS.map((kind) => (
                    <ToggleGroupItem
                        key={kind}
                        value={kind}
                        className="text-mini h-7 rounded-sm px-1"
                    >
                        {labels[kind]}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            {target.kind === 'class' && (
                <Input
                    className="text-mini h-7"
                    placeholder=".my-class"
                    value={target.value ?? ''}
                    onChange={(e) =>
                        onChange({
                            kind: 'class',
                            value: e.target.value.replace(/^\./, ''),
                        })
                    }
                />
            )}
            {target.kind === 'self' && (
                <span className="text-foreground-tertiary text-mini">
                    {t(
                        transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target
                            .selfHint,
                    )}
                </span>
            )}
            {target.kind === 'class' && (
                <span className="text-foreground-tertiary text-mini">
                    {t(
                        transKeys.editor.panels.edit.tabs.interactions.editor.triggerSettings.target
                            .classHint,
                    )}
                </span>
            )}
        </div>
    );
}
