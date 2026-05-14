'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { TextStyle } from '@weblab/models/style';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { useEditorEngine } from '@/components/store/editor';
import { SetupTokensCta } from '../setup-tokens-cta';

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

const FAMILY_OPTIONS = ['font-sans', 'font-serif', 'font-mono', 'font-display'];

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

const TextStylesPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        void tokens.scan();
    }, [tokens]);

    return (
        <div className="text-active text-mini flex h-full w-full flex-grow flex-col overflow-y-auto p-0">
            <div className="border-border bg-background fixed top-0 right-0 left-0 z-10 flex items-center gap-2 border-b py-1.5 pr-2.5 pl-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-background-secondary h-7 w-7 rounded-md"
                    onClick={() => editorEngine.state.setBrandTab(null)}
                >
                    <Icons.ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-foreground text-small font-normal">Text Styles</h2>
            </div>

            <div className="mt-[2.5rem] flex flex-col gap-3 px-4 py-4">
                {!tokens.hasTokensLayer ? (
                    <SetupTokensCta />
                ) : (
                    <>
                        {tokens.textStyles.length === 0 && !adding && (
                            <div className="text-foreground-secondary text-mini px-1 py-2">
                                No text styles yet — add one to reuse typography across your
                                project.
                            </div>
                        )}
                        {tokens.textStyles.map((style) => (
                            <TextStyleRow key={style.name} style={style} />
                        ))}
                        {adding ? (
                            <AddTextStyleForm onCancel={() => setAdding(false)} />
                        ) : (
                            <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground bg-background-secondary hover:bg-background-secondary/70 border-border text-small h-10 w-full rounded-lg border"
                                onClick={() => setAdding(true)}
                            >
                                <Icons.Plus className="mr-2 h-4 w-4" />
                                Add a text style
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

const TextStyleRow = observer(function TextStyleRow({ style }: { style: TextStyle }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[]>(style.applyClasses);

    const previewSize = style.resolved.fontSize ?? '1rem';
    const previewWeight = style.resolved.fontWeight ?? '400';

    const pickClass = (options: string[], current: string[]): string | undefined =>
        current.find((c) => options.includes(c));

    const setOnly = (options: string[], cls: string) => {
        setDraft((d) => [...d.filter((c) => !options.includes(c)), cls]);
    };

    const save = async () => {
        await tokens.updateTextStyle(style.name, draft);
        setOpen(false);
    };

    return (
        <div className="border-border flex flex-col gap-2 rounded-md border">
            <div className="group flex items-center gap-3 px-3 py-2">
                <div className="flex-1">
                    <div
                        className="text-foreground-primary truncate"
                        style={{
                            fontSize: previewSize,
                            fontWeight: previewWeight,
                            lineHeight: style.resolved.lineHeight ?? 1.2,
                            letterSpacing: style.resolved.letterSpacing ?? 'normal',
                        }}
                    >
                        {style.displayName}
                    </div>
                    <div className="text-foreground-secondary text-micro mt-0.5">
                        {style.applyClasses.join(' · ')}
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                        setDraft(style.applyClasses);
                        setOpen(!open);
                    }}
                >
                    {open ? 'Close' : 'Edit'}
                </Button>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 [&[data-state=open]]:opacity-100"
                        >
                            <Icons.DotsHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void tokens.deleteTextStyle(style.name)}>
                            <Icons.Trash className="mr-2 h-3.5 w-3.5" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {open && (
                <div className="border-border grid grid-cols-2 gap-2 border-t px-3 py-2">
                    <ClassSelect
                        label="Family"
                        options={FAMILY_OPTIONS}
                        current={pickClass(FAMILY_OPTIONS, draft) ?? ''}
                        onChange={(v) => setOnly(FAMILY_OPTIONS, v)}
                    />
                    <ClassSelect
                        label="Weight"
                        options={WEIGHT_OPTIONS}
                        current={pickClass(WEIGHT_OPTIONS, draft) ?? ''}
                        onChange={(v) => setOnly(WEIGHT_OPTIONS, v)}
                    />
                    <ClassSelect
                        label="Size"
                        options={SIZE_OPTIONS}
                        current={pickClass(SIZE_OPTIONS, draft) ?? ''}
                        onChange={(v) => setOnly(SIZE_OPTIONS, v)}
                    />
                    <ClassSelect
                        label="Leading"
                        options={LEADING_OPTIONS}
                        current={pickClass(LEADING_OPTIONS, draft) ?? ''}
                        onChange={(v) => setOnly(LEADING_OPTIONS, v)}
                    />
                    <ClassSelect
                        label="Tracking"
                        options={TRACKING_OPTIONS}
                        current={pickClass(TRACKING_OPTIONS, draft) ?? ''}
                        onChange={(v) => setOnly(TRACKING_OPTIONS, v)}
                    />
                    <div className="col-span-2 flex justify-end">
                        <Button size="sm" onClick={save}>
                            Save
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
});

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
        <div className="flex flex-col gap-1">
            <Label className="text-micro">{label}</Label>
            <select
                value={current}
                onChange={(e) => onChange(e.target.value)}
                className="border-input bg-background text-mini h-7 rounded-md border px-2"
            >
                <option value="">—</option>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        </div>
    );
}

function AddTextStyleForm({ onCancel }: { onCancel: () => void }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [name, setName] = useState('');
    const [classes, setClasses] = useState('font-sans font-normal text-base leading-normal');

    const submit = async () => {
        if (!name.trim()) return;
        const slug = name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const applyClasses = classes.split(/\s+/).filter(Boolean);
        await tokens.addTextStyle({ name: slug, applyClasses });
        onCancel();
    };

    return (
        <div className="bg-background-secondary border-foreground/5 flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Name</Label>
                <Input
                    autoFocus
                    placeholder="heading-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Apply classes</Label>
                <Input
                    value={classes}
                    onChange={(e) => setClasses(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" onClick={submit} disabled={!name.trim()}>
                    Create
                </Button>
            </div>
        </div>
    );
}

export default TextStylesPanel;
