'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { VariableGroup, VariableToken } from '@weblab/models/style';
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

const GROUP_FILTERS: Array<{ id: VariableGroup | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'color', label: 'Color' },
    { id: 'space', label: 'Space' },
    { id: 'font', label: 'Font' },
    { id: 'radius', label: 'Radius' },
    { id: 'shadow', label: 'Shadow' },
];

const VariablesPanel = observer(() => {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [filter, setFilter] = useState<VariableGroup | 'all'>('all');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        void tokens.scan();
    }, [tokens]);

    const filtered = useMemo(() => {
        if (filter === 'all') return tokens.variables;
        return tokens.variables.filter((v) => v.group === filter);
    }, [filter, tokens.variables]);

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
                <h2 className="text-foreground text-small font-normal">Variables</h2>
            </div>

            <div className="mt-[2.5rem] flex flex-col gap-3 px-4 py-4">
                {!tokens.hasTokensLayer ? (
                    <SetupTokensCta />
                ) : (
                    <>
                        <div className="flex flex-wrap gap-1">
                            {GROUP_FILTERS.map((g) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setFilter(g.id)}
                                    className={cn(
                                        'text-mini text-foreground-secondary hover:bg-background-secondary rounded-sm px-2 py-1',
                                        filter === g.id &&
                                            'bg-foreground/10 text-foreground-primary',
                                    )}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>

                        {filtered.length === 0 && (
                            <div className="text-foreground-secondary text-mini px-1 py-2">
                                {tokens.variables.length === 0
                                    ? 'No variables yet — add one to reuse values across your project.'
                                    : 'No variables in this group.'}
                            </div>
                        )}

                        <div className="flex flex-col gap-1">
                            {filtered.map((v) => (
                                <VariableRow key={v.name} variable={v} />
                            ))}
                        </div>

                        {adding ? (
                            <AddVariableForm onCancel={() => setAdding(false)} />
                        ) : (
                            <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground bg-background-secondary hover:bg-background-secondary/70 border-border text-small h-10 w-full rounded-lg border"
                                onClick={() => setAdding(true)}
                            >
                                <Icons.Plus className="mr-2 h-4 w-4" />
                                Add a variable
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

const VariableRow = observer(function VariableRow({ variable }: { variable: VariableToken }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [light, setLight] = useState(variable.light);
    const [dark, setDark] = useState(variable.dark ?? '');
    const [hasDark, setHasDark] = useState(variable.dark != null);

    useEffect(() => {
        setLight(variable.light);
        setDark(variable.dark ?? '');
        setHasDark(variable.dark != null);
    }, [variable.light, variable.dark]);

    const isColor = variable.group === 'color';

    const commit = async () => {
        await tokens.updateVariable(variable.name, {
            light,
            dark: hasDark ? dark : null,
        });
    };

    return (
        <div className="border-border hover:border-border-hover group flex items-center gap-2 rounded-md border px-3 py-2">
            {isColor && (
                <div
                    aria-hidden
                    className="border-border h-5 w-5 shrink-0 rounded border"
                    style={{ backgroundColor: light }}
                />
            )}
            <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-foreground-primary text-mini truncate">
                    {variable.displayName}
                </span>
                <span className="text-foreground-secondary text-micro truncate">
                    --{variable.name}
                </span>
            </div>
            <Input
                value={light}
                onChange={(e) => setLight(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') void commit();
                }}
                className="text-mini h-7 w-24"
            />
            {hasDark ? (
                <Input
                    value={dark}
                    onChange={(e) => setDark(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void commit();
                    }}
                    placeholder="dark"
                    className="text-mini h-7 w-24"
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setHasDark(true)}
                    className="text-foreground-secondary hover:text-foreground-primary text-mini opacity-0 group-hover:opacity-100"
                    title="Add dark override"
                >
                    <Icons.Moon className="h-3.5 w-3.5" />
                </button>
            )}
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
                    {hasDark && (
                        <DropdownMenuItem
                            onSelect={async () => {
                                setHasDark(false);
                                await tokens.updateVariable(variable.name, { dark: null });
                            }}
                        >
                            <Icons.Reset className="mr-2 h-3.5 w-3.5" />
                            Remove dark override
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => void tokens.deleteVariable(variable.name)}>
                        <Icons.Trash className="mr-2 h-3.5 w-3.5" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
});

function AddVariableForm({ onCancel }: { onCancel: () => void }) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [name, setName] = useState('');
    const [light, setLight] = useState('');
    const [dark, setDark] = useState('');
    const [hasDark, setHasDark] = useState(false);

    const submit = async () => {
        const slug = name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        if (!slug || !light.trim()) return;
        await tokens.addVariable({
            name: slug,
            light,
            dark: hasDark ? dark : null,
        });
        onCancel();
    };

    return (
        <div className="bg-background-secondary border-border flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Name (e.g. space-md, color-bg)</Label>
                <Input
                    autoFocus
                    placeholder="space-md"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label className="text-micro">Light value</Label>
                <Input
                    placeholder="1rem / #ffffff"
                    value={light}
                    onChange={(e) => setLight(e.target.value)}
                    className="text-mini h-7"
                />
            </div>
            <button
                type="button"
                className="text-mini text-foreground-secondary hover:text-foreground-primary self-start"
                onClick={() => setHasDark(!hasDark)}
            >
                {hasDark ? '− Remove dark override' : '+ Different in dark mode'}
            </button>
            {hasDark && (
                <div className="flex flex-col gap-1">
                    <Label className="text-micro">Dark value</Label>
                    <Input
                        value={dark}
                        onChange={(e) => setDark(e.target.value)}
                        className="text-mini h-7"
                    />
                </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" onClick={submit}>
                    Create
                </Button>
            </div>
        </div>
    );
}

export default VariablesPanel;
