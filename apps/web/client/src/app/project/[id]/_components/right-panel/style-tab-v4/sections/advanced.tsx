'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Variable } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { CustomExpander, GroupShell, LabeledSelectInput, TextField } from '../controls';
import { FIELD_BASE_CLASSES } from '../controls/constants';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

interface CustomPropertyRow {
    name: string;
    value: string;
}

/**
 * Advanced section — Float / Clear + Custom CSS variables.
 * Ported to v4 grammar: each row inside the expanders wrapped in GroupShell.
 * CustomExpanders are preserved so the section reads as two disclosure groups.
 */
export const AdvancedSection = observer(function AdvancedSection() {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;

    const float = useStyleValue('float');
    const clear = useStyleValue('clear');

    const floatSetter = useStyleSetter('float');
    const clearSetter = useStyleSetter('clear');

    const customRows: CustomPropertyRow[] = useMemo(() => {
        const defined = selectedStyle?.styles.defined ?? {};
        return Object.entries(defined)
            .filter(([k]) => k.startsWith('--'))
            .map(([k, v]) => ({ name: k.slice(2), value: String(v) }));
    }, [selectedStyle]);

    const layoutAnySet = float.isSet || clear.isSet;

    const [variablesOpen, setVariablesOpen] = useState(customRows.length > 0);
    const [layoutOpen, setLayoutOpen] = useState(layoutAnySet);
    const [draftRow, setDraftRow] = useState(false);

    // Auto-open/close when switching elements.
    useEffect(() => {
        if (customRows.length > 0) setVariablesOpen(true);
        else setVariablesOpen(false);
    }, [customRows.length]);
    useEffect(() => {
        if (layoutAnySet) setLayoutOpen(true);
        else setLayoutOpen(false);
    }, [layoutAnySet]);

    return (
        <Section id="advanced" title="Advanced">
            <div className="flex flex-col gap-3 px-3 pb-3">
                <CustomExpander
                    open={layoutOpen}
                    onOpenChange={setLayoutOpen}
                    label="Layout extras"
                >
                    <GroupShell label="Float" onReset={() => floatSetter.set('')}>
                        <LabeledSelectInput
                            label="Float"
                            value={float.value}
                            options={[
                                { value: 'none', label: 'None' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ]}
                            onCommit={floatSetter.set}
                        />
                    </GroupShell>

                    <GroupShell label="Clear" onReset={() => clearSetter.set('')}>
                        <LabeledSelectInput
                            label="Clear"
                            value={clear.value}
                            options={[
                                { value: 'none', label: 'None' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                                { value: 'both', label: 'Both' },
                            ]}
                            onCommit={clearSetter.set}
                        />
                    </GroupShell>
                </CustomExpander>

                <CustomExpander
                    open={variablesOpen}
                    onOpenChange={setVariablesOpen}
                    label="Custom properties"
                    summary={customRows.length > 0 ? `${customRows.length} set` : undefined}
                >
                    {customRows.length === 0 && !draftRow && (
                        <p className="text-foreground-tertiary text-mini px-3 py-1">
                            No custom properties.
                        </p>
                    )}
                    {customRows.map((row) => (
                        <CustomVarRow
                            key={row.name}
                            row={row}
                            onCommit={(name, value) => {
                                if (name !== row.name) {
                                    editorEngine.style.update(`--${row.name}`, '');
                                }
                                editorEngine.style.update(`--${name}`, value);
                            }}
                            onRemove={() => {
                                const removedName = row.name;
                                const removedValue = row.value;
                                editorEngine.style.update(`--${removedName}`, '');
                                toast(`Removed --${removedName}`, {
                                    action: {
                                        label: 'Undo',
                                        onClick: () =>
                                            editorEngine.style.update(
                                                `--${removedName}`,
                                                removedValue,
                                            ),
                                    },
                                });
                            }}
                        />
                    ))}
                    {draftRow && (
                        <CustomVarRow
                            row={{ name: '', value: '' }}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            onCommit={(name, value) => {
                                if (!name) return;
                                editorEngine.style.update(`--${name}`, value);
                                setDraftRow(false);
                            }}
                            onRemove={() => setDraftRow(false)}
                        />
                    )}
                    <div className="px-3 pt-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-mini text-foreground-secondary hover:text-foreground-primary h-6 cursor-pointer px-2"
                            onClick={() => setDraftRow(true)}
                        >
                            <Variable className="mr-1 size-3" />
                            Add variable
                        </Button>
                    </div>
                </CustomExpander>
            </div>
        </Section>
    );
});

interface CustomVarRowProps {
    row: CustomPropertyRow;
    onCommit: (name: string, value: string) => void;
    onRemove: () => void;
    autoFocus?: boolean;
}

function CustomVarRow({ row, onCommit, onRemove, autoFocus }: CustomVarRowProps) {
    const [name, setName] = useState(row.name);
    const skipBlurCommitRef = useRef(false);

    return (
        <div className="group/control flex items-center gap-1.5 px-3 py-1">
            <span className="text-foreground-secondary text-mini shrink-0">--</span>
            <input
                type="text"
                value={name}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={autoFocus}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                    if (skipBlurCommitRef.current) {
                        skipBlurCommitRef.current = false;
                        return;
                    }
                    if (name && name !== row.name) onCommit(name, row.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (name && name !== row.name) onCommit(name, row.value);
                        skipBlurCommitRef.current = true;
                        e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setName(row.name);
                        skipBlurCommitRef.current = true;
                        e.currentTarget.blur();
                    }
                }}
                placeholder="brand"
                aria-label="Custom property name"
                className={cn(FIELD_BASE_CLASSES, 'w-24 min-w-0 shrink-0')}
            />
            <TextField
                value={row.value}
                onCommit={(v) => name && onCommit(name, v)}
                placeholder="#ff0066"
                className="flex-1"
            />
            <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="size-7 shrink-0 cursor-pointer"
                aria-label={`Remove --${row.name}`}
            >
                <Icons.Trash className="size-3" />
            </Button>
        </div>
    );
}
