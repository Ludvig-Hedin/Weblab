'use client';

import { useTranslations } from 'next-intl';

import type { ActionStepKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons/index';

import { transKeys } from '@/i18n/keys';

interface ActionTypePickerProps {
    onPick: (kind: ActionStepKind) => void;
}

const KINDS: ActionStepKind[] = ['move', 'scale', 'rotate', 'opacity', 'size', 'bg-color'];

export function ActionTypePicker({ onPick }: ActionTypePickerProps) {
    const t = useTranslations();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-mini h-7 w-full justify-start gap-1.5"
                >
                    <Icons.Plus className="h-3 w-3" />
                    {t(transKeys.editor.panels.edit.tabs.interactions.editor.addAction)}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
                {KINDS.map((kind) => (
                    <DropdownMenuItem key={kind} onClick={() => onPick(kind)}>
                        {labelFor(kind, t)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function labelFor(kind: ActionStepKind, t: ReturnType<typeof useTranslations>): string {
    switch (kind) {
        case 'move':
            return t(transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.move);
        case 'scale':
            return t(transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.scale);
        case 'rotate':
            return t(transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.rotate);
        case 'opacity':
            return t(transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.opacity);
        case 'size':
            return t(transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.size);
        case 'bg-color':
            return t(
                transKeys.editor.panels.edit.tabs.interactions.editor.actionTypes.backgroundColor,
            );
    }
}
