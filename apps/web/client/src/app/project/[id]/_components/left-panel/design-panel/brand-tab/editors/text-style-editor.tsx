'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { TextStyle } from '@weblab/models/style';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import type { TokenRowData } from '../lib/group-tokens';
import type { ConfirmFn } from '../lib/token-mutations';
import { useEditorEngine } from '@/components/store/editor';
import { slugify } from '../lib/token-mutations';

const FAMILY_OPTIONS = ['font-sans', 'font-serif', 'font-mono', 'font-display'];
const WEIGHT_OPTIONS = [
    'font-thin',
    'font-light',
    'font-normal',
    'font-medium',
    'font-semibold',
    'font-bold',
    'font-extrabold',
    'font-black',
];
const SIZE_OPTIONS = [
    'text-xs',
    'text-sm',
    'text-base',
    'text-lg',
    'text-xl',
    'text-2xl',
    'text-3xl',
    'text-4xl',
    'text-5xl',
    'text-6xl',
];
const LEADING_OPTIONS = [
    'leading-none',
    'leading-tight',
    'leading-snug',
    'leading-normal',
    'leading-relaxed',
    'leading-loose',
];
const TRACKING_OPTIONS = [
    'tracking-tighter',
    'tracking-tight',
    'tracking-normal',
    'tracking-wide',
    'tracking-wider',
    'tracking-widest',
];

// Design-system foreground tokens (left curated to avoid clashes with the
// `text-xs/sm/base/...` size scale, which uses the same `text-*` prefix).
const TEXT_COLOR_OPTIONS = [
    'text-foreground',
    'text-foreground-primary',
    'text-foreground-secondary',
    'text-foreground-tertiary',
    'text-foreground-brand',
    'text-muted-foreground',
];

function ClassSelect({
    label,
    options,
    current,
    onChange,
}: {
    label: string;
    options: string[];
    current: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <Label className="text-micro text-foreground-secondary w-12 shrink-0">{label}</Label>
            <select
                value={current}
                onChange={(e) => onChange(e.target.value)}
                className="border-input bg-background text-mini h-7 min-w-0 flex-1 rounded-md border px-2"
            >
                <option value="">—</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
}

export interface TextStyleEditorProps {
    /** Row of kind `text-style`. */
    row: TokenRowData;
    onClose: () => void;
    confirm: ConfirmFn;
}

/**
 * Inline editor for a text style. Progressive disclosure — Font / Weight /
 * Size / Leading up top, Tracking behind "More…". Each change commits
 * immediately; the underlying `applyClasses` round-trip is unchanged.
 */
export const TextStyleEditor = observer(function TextStyleEditor({
    row,
    onClose,
    confirm,
}: TextStyleEditorProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const style = row.token as TextStyle;

    const [label, setLabel] = useState(row.label);
    const [draft, setDraft] = useState<string[]>(style.applyClasses);
    const [showMore, setShowMore] = useState(false);

    const pick = (options: string[]) => draft.find((c) => options.includes(c)) ?? '';

    const applyChange = (options: string[], cls: string) => {
        const next = [...draft.filter((c) => !options.includes(c)), ...(cls ? [cls] : [])];
        setDraft(next);
        void tokens.updateTextStyle(row.name, next);
    };

    const commitName = async () => {
        const slug = slugify(label);
        if (!slug || slug === row.name) return;
        await tokens.renameTextStyle(row.name, slug);
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Delete “${row.label}”?`,
            description: 'This text style will be removed from globals.css and cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        await tokens.deleteTextStyle(row.name);
        onClose();
    };

    return (
        <div className="bg-background-secondary border-border mx-2 mb-1 flex flex-col gap-2 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
                <Label className="text-micro text-foreground-secondary w-12 shrink-0">Name</Label>
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={() => void commitName()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className="text-mini h-7"
                />
            </div>
            <ClassSelect
                label="Font"
                options={FAMILY_OPTIONS}
                current={pick(FAMILY_OPTIONS)}
                onChange={(v) => applyChange(FAMILY_OPTIONS, v)}
            />
            <ClassSelect
                label="Weight"
                options={WEIGHT_OPTIONS}
                current={pick(WEIGHT_OPTIONS)}
                onChange={(v) => applyChange(WEIGHT_OPTIONS, v)}
            />
            <ClassSelect
                label="Size"
                options={SIZE_OPTIONS}
                current={pick(SIZE_OPTIONS)}
                onChange={(v) => applyChange(SIZE_OPTIONS, v)}
            />
            <ClassSelect
                label="Leading"
                options={LEADING_OPTIONS}
                current={pick(LEADING_OPTIONS)}
                onChange={(v) => applyChange(LEADING_OPTIONS, v)}
            />
            <ClassSelect
                label="Color"
                options={TEXT_COLOR_OPTIONS}
                current={pick(TEXT_COLOR_OPTIONS)}
                onChange={(v) => applyChange(TEXT_COLOR_OPTIONS, v)}
            />
            {showMore && (
                <ClassSelect
                    label="Tracking"
                    options={TRACKING_OPTIONS}
                    current={pick(TRACKING_OPTIONS)}
                    onChange={(v) => applyChange(TRACKING_OPTIONS, v)}
                />
            )}
            <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                className="text-foreground-secondary hover:text-foreground-primary text-mini self-start"
            >
                {showMore ? 'Less' : 'More…'}
            </button>
            <div className="text-foreground-tertiary text-micro truncate font-mono">
                {style.className}
            </div>
            <div className="flex items-center justify-between pt-0.5">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-7 px-2"
                    onClick={() => void handleDelete()}
                >
                    <Icons.Trash className="mr-1.5 size-3.5" />
                    Delete
                </Button>
                <Button size="sm" className="h-7" onClick={onClose}>
                    Done
                </Button>
            </div>
        </div>
    );
});
