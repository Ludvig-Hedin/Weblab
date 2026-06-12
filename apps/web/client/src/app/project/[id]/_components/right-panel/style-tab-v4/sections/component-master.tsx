'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ComponentPropSpec } from '@weblab/models';
import type { CreatablePropKind } from '@weblab/parser';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { LabeledTextInput, SelectField } from '../controls';
import { Section } from './section';

const KIND_OPTIONS: Array<{ value: CreatablePropKind; label: string }> = [
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image (src)' },
    { value: 'link', label: 'Link (href)' },
    { value: 'switch', label: 'Visibility' },
    { value: 'number', label: 'Number' },
];

const TYPE_LABEL: Record<string, string> = {
    text: 'text',
    richtext: 'rich text',
    image: 'image',
    link: 'link',
    number: 'number',
    switch: 'switch',
    slot: 'slot',
    variant: 'variant',
    unsupported: '—',
};

/**
 * Master-edit Properties — shown while editing a component in-context.
 * Lists the component's props (green dot = bound to an element) and offers
 * "create property from the selected element" with the current literal
 * hoisted into the default.
 */
export const ComponentMasterSection = observer(function ComponentMasterSection() {
    const editorEngine = useEditorEngine();
    const session = editorEngine.components.editing;
    const selected = editorEngine.elements.selected[0];

    const [open, setOpen] = useState(false);
    const [propName, setPropName] = useState('');
    const [kind, setKind] = useState<CreatablePropKind>('text');
    const [busy, setBusy] = useState(false);

    if (!session) return null;

    // Re-read from the live index so freshly created props appear.
    const def = editorEngine.components.get(session.def.key) ?? session.def;
    const canCreate =
        !!selected?.oid && editorEngine.components.isInEditScope(selected.frameId, selected.domId);

    const create = async () => {
        if (!selected?.oid || busy) return;
        setBusy(true);
        try {
            const result = await editorEngine.components.createProp({
                def,
                elementOid: selected.oid,
                propName: propName.trim(),
                kind,
                branchId: session.branchId,
            });
            if (!result.ok) {
                toast.error('Could not create property', { description: result.error });
                return;
            }
            toast.success(`Property "${propName.trim()}" created`);
            setOpen(false);
            setPropName('');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Section id="component" title={`${def.name} · Properties`} setCount={def.props.length}>
            <div className="flex flex-col gap-1 px-3">
                {def.props.length === 0 && (
                    <p className="text-foreground-tertiary text-mini py-1.5">
                        No properties yet. Select an element and create one below.
                    </p>
                )}
                {def.props.map((prop) => (
                    <PropRow key={prop.name} prop={prop} />
                ))}

                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            disabled={!canCreate}
                            className="text-foreground-tertiary hover:text-foreground-primary mt-1 flex h-6 w-full items-center justify-center gap-1 rounded border border-dashed border-green-500/40 text-[11px] hover:border-green-500/70 disabled:opacity-50"
                            title={
                                canCreate
                                    ? 'Create a property from the selected element'
                                    : 'Select an element inside the component first'
                            }
                        >
                            <Icons.Plus className="h-2.5 w-2.5" />
                            Property from selection
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="left" className="w-56 p-2">
                        <div className="flex flex-col gap-2">
                            <LabeledTextInput
                                label="Name"
                                value={propName}
                                placeholder="title"
                                onCommit={setPropName}
                            />
                            <SelectField
                                value={kind}
                                options={KIND_OPTIONS}
                                onCommit={(next) => setKind(next as CreatablePropKind)}
                            />
                            <Button
                                size="sm"
                                className="h-7 w-full text-[11px]"
                                disabled={busy || propName.trim().length === 0}
                                onClick={() => void create()}
                            >
                                {busy ? 'Creating…' : 'Create property'}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </Section>
    );
});

const PropRow = ({ prop }: { prop: ComponentPropSpec }) => {
    const hasElementBinding = prop.bindings.some((b) => 'oid' in b && b.oid);
    return (
        <div className="flex h-6 items-center gap-2 text-[11px]">
            <span
                aria-hidden
                className={
                    hasElementBinding
                        ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-green-400'
                        : 'border-border h-1.5 w-1.5 shrink-0 rounded-full border'
                }
                title={hasElementBinding ? 'Connected to an element' : 'Not connected'}
            />
            <span className="text-foreground-primary min-w-0 flex-1 truncate font-mono">
                {prop.name}
            </span>
            <span className="text-foreground-tertiary shrink-0">
                {TYPE_LABEL[prop.type] ?? prop.type}
            </span>
            {prop.defaultValue != null && (
                <span
                    className="text-foreground-tertiary max-w-[80px] shrink-0 truncate"
                    title={String(prop.defaultValue)}
                >
                    {String(prop.defaultValue)}
                </span>
            )}
        </div>
    );
};
