'use client';

import { useMemo, useRef, useState } from 'react';
import { Variable } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { CustomExpander, PropertyControl, SelectField, TextField } from '../controls';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

interface CustomPropertyRow {
    name: string;
    value: string;
}

/**
 * Advanced — properties not shown in the Figma but kept for full v2 parity:
 *   - Float / Clear (rare but still addressable).
 *   - Custom CSS variables (--name: value rows).
 *
 * Margin moved into the Layout section and Transitions to their own section;
 * what remains lives behind a CustomExpander each so the section reads as one
 * "everything else" disclosure rather than separate accordions.
 */
export const AdvancedSection = observer(function AdvancedSection() {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;

    const float = useStyleValue('float');
    const clear = useStyleValue('clear');

    const customRows: CustomPropertyRow[] = useMemo(() => {
        const defined = selectedStyle?.styles.defined ?? {};
        return Object.entries(defined)
            .filter(([k]) => k.startsWith('--'))
            .map(([k, v]) => ({ name: k.slice(2), value: String(v) }));
    }, [selectedStyle]);

    const layoutAnySet = float.isSet || clear.isSet;

    const setCount = [float, clear].filter((v) => v.isSet).length + customRows.length;

    const [variablesOpen, setVariablesOpen] = useState(customRows.length > 0);
    const [layoutOpen, setLayoutOpen] = useState(layoutAnySet);
    const [draftRow, setDraftRow] = useState(false);

    return (
        <Section id="advanced" title="Advanced" setCount={setCount}>
            <CustomExpander open={layoutOpen} onOpenChange={setLayoutOpen} label="Layout extras">
                <PropertyControl property="float" label="Float">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={[
                                { value: 'none', label: 'None' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ]}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="clear" label="Clear">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={[
                                { value: 'none', label: 'None' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                                { value: 'both', label: 'Both' },
                            ]}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
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
                            // Capture name+value BEFORE removal so the Undo
                            // action can re-write the exact pair.
                            const removedName = row.name;
                            const removedValue = row.value;
                            editorEngine.style.update(`--${removedName}`, '');
                            toast(`Removed --${removedName}`, {
                                action: {
                                    label: 'Undo',
                                    onClick: () =>
                                        editorEngine.style.update(`--${removedName}`, removedValue),
                                },
                            });
                        }}
                    />
                ))}
                {draftRow && (
                    <CustomVarRow
                        row={{ name: '', value: '' }}
                        // Newly inserted draft — caret should land in the name
                        // field so the user types immediately after pressing
                        // "Add variable".
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
    // Escape blurs the input; without this the trailing onBlur would still see
    // the stale draft in its closure and commit it. Mirrors TextField.
    const skipBlurCommitRef = useRef(false);
    return (
        <div className="group/control flex items-center gap-1.5 px-3 py-1">
            <span className="text-foreground-secondary text-mini shrink-0">--</span>
            {/* Name input mirrors FIELD_BASE_CLASSES geometry (h-[30px],
                rounded-[8px], foreground/5 surface) so it sits in the same
                field family as the TextField beside it — no darker inset. */}
            <input
                type="text"
                value={name}
                // First-row name input gets focus so the user can immediately
                // start typing the variable name after clicking "Add variable".
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
                // Mirror TextField's keyboard behaviour: Enter commits + blurs,
                // Escape reverts the draft + blurs.
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
                className="border-input bg-foreground/5 hover:bg-foreground/[0.08] focus-visible:border-ring focus-visible:ring-foreground-brand/30 text-mini text-foreground-primary placeholder:text-muted-foreground h-[30px] w-24 min-w-0 rounded-[8px] border px-[10px] transition-colors outline-none focus-visible:ring-[3px] dark:border-white/[0.08] dark:bg-[rgb(50,50,50)] dark:hover:border-white/[0.14] dark:hover:bg-[rgb(58,58,58)]"
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
