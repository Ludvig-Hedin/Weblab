'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';

import { useEditorEngine } from '@/components/store/editor';
import { TextField } from '../controls/text-field';
import { Section } from './section';

interface CustomPropertyRow {
    name: string;
    value: string;
}

function VarRow({
    row,
    onCommit,
    onRemove,
}: {
    row: CustomPropertyRow;
    onCommit: (name: string, value: string) => void;
    onRemove: () => void;
}) {
    const [name, setName] = useState(row.name);
    const [value, setValue] = useState(row.value);

    useEffect(() => {
        setName(row.name);
        setValue(row.value);
    }, [row.name, row.value]);

    return (
        <div className="flex items-center gap-1 px-3 py-1">
            <span className="text-foreground-secondary text-mini">--</span>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                    if (name && (name !== row.name || value !== row.value)) {
                        onCommit(name, value);
                    }
                }}
                placeholder="brand"
                aria-label="Custom property name"
                className="border-input bg-background text-mini h-7 w-24 min-w-0 rounded-md border px-2 outline-none"
            />
            <TextField
                value={value}
                onCommit={(v) => {
                    setValue(v);
                    if (name) onCommit(name, v);
                }}
                placeholder="#ff0066"
                className="flex-1"
            />
            <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="h-6 w-6"
                aria-label={`Remove --${row.name}`}
            >
                <Icons.Trash className="h-3 w-3" />
            </Button>
        </div>
    );
}

/**
 * Custom CSS properties (CSS variables). Each row is a `--name: value` pair
 * written via the existing StyleManager pipeline; on commit the property is
 * either added, updated, or removed.
 */
export const CustomPropertiesSection = observer(function CustomPropertiesSection() {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;

    // Find any --foo entries in defined.
    const rows: CustomPropertyRow[] = useMemo(() => {
        const defined = selectedStyle?.styles.defined ?? {};
        return Object.entries(defined)
            .filter(([k]) => k.startsWith('--'))
            .map(([k, v]) => ({ name: k.slice(2), value: String(v) }));
    }, [selectedStyle]);

    const setCount = rows.length;
    const [draft, setDraft] = useState(false);

    const upsert = (name: string, value: string) => {
        editorEngine.style.update(`--${name}`, value);
    };
    const remove = (name: string) => {
        editorEngine.style.update(`--${name}`, '');
    };

    return (
        <Section
            id="custom-properties"
            title="Custom properties"
            setCount={setCount}
            actions={
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => setDraft(true)}
                >
                    + Add
                </Button>
            }
        >
            {rows.length === 0 && !draft && (
                <p className="text-foreground-tertiary text-mini px-3 py-2">
                    No custom properties. Click "+ Add" to create one.
                </p>
            )}
            {rows.map((row) => (
                <VarRow
                    key={row.name}
                    row={row}
                    onCommit={(n, v) => {
                        if (n !== row.name) {
                            // Rename: remove old, write new.
                            remove(row.name);
                        }
                        upsert(n, v);
                    }}
                    onRemove={() => remove(row.name)}
                />
            ))}
            {draft && (
                <VarRow
                    row={{ name: '', value: '' }}
                    onCommit={(n, v) => {
                        if (!n) return;
                        upsert(n, v);
                        setDraft(false);
                    }}
                    onRemove={() => setDraft(false)}
                />
            )}
        </Section>
    );
});
