'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { ComponentPropSpec } from '@weblab/models';
import type { CreatablePropKind } from '@weblab/parser';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { SelectField } from '../controls';
import { Section } from './section';

// KIND_OPTIONS and TYPE_LABEL are defined inside the component to use t()

/**
 * Master-edit Properties — shown while editing a component in-context.
 * Lists the component's props (green dot = bound to an element) and offers
 * "create property from the selected element" with the current literal
 * hoisted into the default.
 */
export const ComponentMasterSection = observer(function ComponentMasterSection() {
    const t = useTranslations('editor.stylePanel');
    const editorEngine = useEditorEngine();

    const KIND_OPTIONS: Array<{ value: CreatablePropKind; label: string }> = [
        { value: 'text', label: t('component.text') },
        { value: 'image', label: 'Image (src)' },
        { value: 'link', label: 'Link (href)' },
        { value: 'switch', label: 'Visibility' },
        { value: 'number', label: t('component.number') },
    ];

    const session = editorEngine.components.editing;
    const selected = editorEngine.elements.selected[0];

    const [open, setOpen] = useState(false);
    const [propName, setPropName] = useState('');
    const [kind, setKind] = useState<CreatablePropKind>('text');
    const [busy, setBusy] = useState(false);
    const [variantOpen, setVariantOpen] = useState(false);
    const [variantName, setVariantName] = useState('');
    const [variantBusy, setVariantBusy] = useState(false);

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
                toast.error(t('component.couldNotCreateProperty'), { description: result.error });
                return;
            }
            toast.success(t('component.propertyCreated', { name: propName.trim() }));
            setOpen(false);
            setPropName('');
        } finally {
            setBusy(false);
        }
    };

    const submitVariant = () => {
        const trimmed = variantName.trim();
        if (!trimmed || variantBusy) return;
        setVariantBusy(true);
        void editorEngine.components
            .addVariant(def, session.branchId, trimmed)
            .then((result) => {
                if (!result.ok) {
                    toast.error(t('component.couldNotAddVariant'), { description: result.error });
                    return;
                }
                toast.success(t('component.variantAdded', { name: trimmed }));
                setVariantOpen(false);
                setVariantName('');
            })
            .finally(() => setVariantBusy(false));
    };

    return (
        <Section id="component" title={t('component.propertiesSection', { name: def.name })} setCount={def.props.length}>
            <div className="flex flex-col gap-1 px-3">
                {def.props.length === 0 && (
                    <p className="text-foreground-tertiary text-mini py-1.5">
                        {t('component.noPropertiesYet')}
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
                                    ? t('component.createPropertyTitle')
                                    : t('component.selectElementFirst')
                            }
                        >
                            <Icons.Plus className="h-2.5 w-2.5" />
                            {t('component.propertyFromSelection')}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="left" className="w-56 p-2">
                        <div className="flex flex-col gap-2">
                            {/* Controlled Input (not commit-on-blur): with a
                                blur-committed field the Create button stays
                                disabled while typing and the first click only
                                blurs — looks broken. */}
                            <Input
                                autoFocus
                                value={propName}
                                placeholder="title"
                                className="h-7 font-mono text-[11px]"
                                onChange={(e) => setPropName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void create();
                                }}
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
                                {busy ? t('component.creating') : t('component.createProperty')}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Variants: list members; "+ Variant" converts the component
                    to a class-map + variant prop on first use. */}
                <div className="mt-2 flex flex-col gap-1">
                    <span className="text-foreground-secondary text-mini font-medium">
                        {t('component.variants')}
                    </span>
                    {def.variants ? (
                        Object.keys(def.variants.variants).map((name) => (
                            <div key={name} className="flex h-5 items-center gap-2 text-[11px]">
                                <span
                                    aria-hidden
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400"
                                />
                                <span className="text-foreground-primary font-mono">{name}</span>
                                {name === def.variants?.defaultVariant && (
                                    <span className="text-foreground-tertiary ml-auto">
                                        {t('component.default')}
                                    </span>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className="text-foreground-tertiary text-tiny">
                            {t('component.noVariantsYet')}
                        </p>
                    )}
                    <Popover open={variantOpen} onOpenChange={setVariantOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="text-foreground-tertiary hover:text-foreground-primary mt-0.5 flex h-6 w-full items-center justify-center gap-1 rounded border border-dashed border-purple-500/30 text-[11px] hover:border-purple-500/60"
                            >
                                <Icons.Plus className="h-2.5 w-2.5" />
                                {t('component.variant')}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" side="left" className="w-48 p-2">
                            <div className="flex flex-col gap-2">
                                <Input
                                    autoFocus
                                    value={variantName}
                                    placeholder="dark"
                                    className="h-7 font-mono text-[11px]"
                                    onChange={(e) => setVariantName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') submitVariant();
                                    }}
                                />
                                <Button
                                    size="sm"
                                    className="h-7 w-full text-[11px]"
                                    disabled={variantBusy || variantName.trim().length === 0}
                                    onClick={submitVariant}
                                >
                                    {variantBusy ? t('component.adding') : t('component.addVariant')}
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </Section>
    );
});

const PropRow = ({ prop }: { prop: ComponentPropSpec }) => {
    const t = useTranslations('editor.stylePanel');
    const TYPE_LABEL: Record<string, string> = {
        text: t('component.text'),
        richtext: t('component.richText'),
        image: t('component.image'),
        link: t('component.link'),
        number: t('component.number'),
        switch: t('component.switch'),
        slot: t('component.slot'),
        variant: t('component.variantType'),
        unsupported: '—',
    };
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
                title={hasElementBinding ? t('component.connectedToElement') : t('component.notConnected')}
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
