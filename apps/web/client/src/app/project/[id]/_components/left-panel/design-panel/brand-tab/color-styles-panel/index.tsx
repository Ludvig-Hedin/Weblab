'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ColorStyle, ColorStyleRef } from '@weblab/models/style';
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
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { SetupTokensCta } from '../setup-tokens-cta';

const ColorStylesPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        void tokens.scan();
    }, [tokens]);

    const handleClose = () => {
        editorEngine.state.setBrandTab(null);
    };

    return (
        <div className="text-active text-mini flex h-full w-full flex-grow flex-col overflow-y-auto p-0">
            <div className="border-border bg-background fixed top-0 right-0 left-0 z-10 flex items-center justify-start gap-2 border-b py-1.5 pr-2.5 pl-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-background-secondary h-7 w-7 rounded-md"
                    onClick={handleClose}
                >
                    <Icons.ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-foreground text-small font-normal">Color Styles</h2>
            </div>

            <div className="mt-[2.5rem] flex flex-col gap-3 px-4 py-4">
                {!tokens.hasTokensLayer ? (
                    <SetupTokensCta />
                ) : (
                    <>
                        {tokens.colorStyles.length === 0 && !adding && (
                            <div className="text-foreground-secondary text-mini px-1 py-2">
                                No color styles yet — add one to bind elements to a semantic name.
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            {tokens.colorStyles.map((style) => (
                                <ColorStyleRow key={style.name} style={style} />
                            ))}
                        </div>

                        {adding ? (
                            <AddColorStyleForm onCancel={() => setAdding(false)} />
                        ) : (
                            <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground bg-background-secondary hover:bg-background-secondary/70 border-border text-small h-10 w-full rounded-lg border"
                                onClick={() => setAdding(true)}
                            >
                                <Icons.Plus className="mr-2 h-4 w-4" />
                                Add a color style
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

const ColorStyleRow = observer(function ColorStyleRow({ style }: { style: ColorStyle }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [editingName, setEditingName] = useState(false);
    const [pendingName, setPendingName] = useState(style.displayName);

    const lightResolved =
        style.refLight.type === 'var'
            ? (tokens.resolveVariableValue(style.refLight.var) ?? '#000000')
            : style.refLight.value;

    const handleRename = async () => {
        if (!pendingName.trim() || pendingName === style.displayName) {
            setEditingName(false);
            return;
        }
        const slug = pendingName
            .trim()
            .toLowerCase()
            .replace(/[\s/]+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        await tokens.renameColorStyle(style.name, slug);
        setEditingName(false);
    };

    return (
        <div className="border-border hover:border-border-hover group flex items-center gap-3 rounded-md border px-3 py-2">
            <div
                aria-hidden
                className="border-border h-6 w-6 shrink-0 rounded border"
                style={{ backgroundColor: lightResolved }}
            />
            <div className="flex flex-1 flex-col gap-0.5">
                {editingName ? (
                    <Input
                        autoFocus
                        value={pendingName}
                        onChange={(e) => setPendingName(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRename();
                            if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="text-mini h-6"
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            setPendingName(style.displayName);
                            setEditingName(true);
                        }}
                        className="text-foreground-primary text-mini text-left"
                    >
                        {style.displayName}
                    </button>
                )}
                <span className="text-foreground-secondary text-micro truncate">
                    {style.refLight.type === 'var'
                        ? `var(--${style.refLight.var})`
                        : style.refLight.value}
                </span>
            </div>
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
                    <DropdownMenuItem
                        onSelect={() => {
                            setPendingName(style.displayName);
                            setEditingName(true);
                        }}
                    >
                        <Icons.Pencil className="mr-2 h-3.5 w-3.5" />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void tokens.deleteColorStyle(style.name)}>
                        <Icons.Trash className="mr-2 h-3.5 w-3.5" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
});

function AddColorStyleForm({ onCancel }: { onCancel: () => void }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [name, setName] = useState('');
    const [refLight, setRefLight] = useState('#3b82f6');
    const [hasDark, setHasDark] = useState(false);
    const [refDark, setRefDark] = useState('#60a5fa');

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const slug = trimmed
            .toLowerCase()
            .replace(/[\s/]+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const parseRef = (v: string): ColorStyleRef =>
            v.startsWith('var(--') && v.endsWith(')')
                ? { type: 'var', var: v.slice(6, -1) }
                : { type: 'literal', value: v };
        await tokens.addColorStyle({
            name: slug,
            refLight: parseRef(refLight),
            refDark: hasDark ? parseRef(refDark) : null,
        });
        onCancel();
    };

    return (
        <div className="bg-background-secondary border-border flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Name</Label>
                <Input
                    autoFocus
                    placeholder="brand/primary"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Light value</Label>
                <Input
                    placeholder="#3b82f6 or var(--color-blue-600)"
                    value={refLight}
                    onChange={(e) => setRefLight(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <button
                type="button"
                className={cn(
                    'text-mini text-foreground-secondary hover:text-foreground-primary self-start',
                )}
                onClick={() => setHasDark(!hasDark)}
            >
                {hasDark ? '− Remove dark override' : '+ Different in dark mode'}
            </button>
            {hasDark && (
                <div className="flex flex-col gap-1">
                    <Label className="text-micro">Dark value</Label>
                    <Input
                        placeholder="#60a5fa or var(--color-blue-400)"
                        value={refDark}
                        onChange={(e) => setRefDark(e.target.value)}
                        className="text-mini h-7"
                    />
                </div>
            )}
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

export default ColorStylesPanel;
