'use client';

import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ComponentDef, ComponentPropSpec, DomElement } from '@weblab/models';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { LabeledTextInput, SelectField } from '../controls';
import { Section } from './section';

type PropValues = Record<string, string | number | boolean | null>;

/**
 * Instance Properties — pinned above the style sections when a component
 * instance is selected. Edits write plain JSX attributes at the usage site;
 * values equal to the component default remove the attribute.
 */
export const ComponentInstanceSection = observer(function ComponentInstanceSection() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const isEditingMaster = !!editorEngine.components.editing;
    const definitions = editorEngine.components.definitions;

    const [def, setDef] = useState<ComponentDef | null>(null);
    const [values, setValues] = useState<PropValues>({});

    const instanceId = selected?.instanceId ?? null;

    const reload = useCallback(async () => {
        if (!selected?.instanceId) {
            setDef(null);
            setValues({});
            return;
        }
        const nextDef = await editorEngine.components.getDefinitionForInstance(selected);
        const nextValues = await editorEngine.components.getInstancePropValues(selected);
        setDef(nextDef);
        setValues(nextValues);
    }, [editorEngine.components, selected]);

    useEffect(() => {
        void reload();
        // `definitions` in the deps: re-resolve when the index updates (e.g.
        // a prop was just created on the master).
    }, [reload, instanceId, definitions]);

    if (!selected?.instanceId || isEditingMaster || !def) return null;

    const editableProps = def.props.filter((p) => p.type !== 'slot');
    const overriddenCount = editableProps.filter((p) => values[p.name] !== undefined).length;

    const commit = (prop: ComponentPropSpec, value: string | number | boolean | null) => {
        // Optimistic local update; the code write + DOM refresh follow.
        setValues((prev) => ({ ...prev, [prop.name]: value }));
        void editorEngine.components.setInstanceProp(selected, prop.name, value).catch((error) => {
            console.error('Failed to set instance prop', error);
            toast.error('Failed to update property');
            void reload();
        });
    };

    const reset = (prop: ComponentPropSpec) => {
        setValues((prev) => {
            const next = { ...prev };
            delete next[prop.name];
            return next;
        });
        void editorEngine.components.resetInstanceProp(selected, prop.name).catch(() => {
            toast.error('Failed to reset property');
            void reload();
        });
    };

    return (
        <Section
            id="component"
            title={def.name}
            setCount={overriddenCount}
            actions={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Component options"
                            className="text-foreground-tertiary hover:text-foreground-primary flex h-5 w-5 items-center justify-center rounded"
                        >
                            <Icons.DotsHorizontal className="h-3 w-3" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                            onSelect={() => void editorEngine.components.enterEditMode(selected)}
                        >
                            <Icons.Component className="mr-2 h-3 w-3 text-purple-400" />
                            Edit component
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={overriddenCount === 0}
                            onSelect={() => {
                                setValues({});
                                void editorEngine.components
                                    .resetAllInstanceProps(selected)
                                    .catch(() => toast.error('Failed to reset properties'));
                            }}
                        >
                            Reset all properties
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            }
        >
            <div className="flex flex-col gap-1 px-3">
                {editableProps.length === 0 && (
                    <p className="text-foreground-tertiary text-mini py-1.5">
                        No properties. Edit the component to expose some.
                    </p>
                )}
                {editableProps.map((prop) => (
                    <PropField
                        key={prop.name}
                        prop={prop}
                        selected={selected}
                        value={values[prop.name]}
                        onCommit={commit}
                        onReset={reset}
                    />
                ))}
                <button
                    type="button"
                    className="text-foreground-tertiary hover:text-foreground-primary mt-1 flex h-6 w-full items-center justify-center gap-1 rounded border border-dashed border-purple-500/30 text-[11px] hover:border-purple-500/60"
                    onClick={() => void editorEngine.components.enterEditMode(selected)}
                >
                    <Icons.Pencil className="h-2.5 w-2.5" />
                    Edit component
                </button>
            </div>
        </Section>
    );
});

const PropField = ({
    prop,
    selected,
    value,
    onCommit,
    onReset,
}: {
    prop: ComponentPropSpec;
    selected: DomElement;
    value: string | number | boolean | null | undefined;
    onCommit: (prop: ComponentPropSpec, value: string | number | boolean | null) => void;
    onReset: (prop: ComponentPropSpec) => void;
}) => {
    void selected;
    const isOverridden = value !== undefined;
    const effective = value ?? prop.defaultValue;

    if (!prop.editable) {
        return (
            <div className="text-foreground-tertiary flex h-6 items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono">{prop.name}</span>
                <span className="truncate italic" title={prop.rawTypeText}>
                    {value === null ? 'dynamic' : (prop.rawTypeText ?? 'unsupported')}
                </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'group/prop relative flex items-center gap-1',
                isOverridden &&
                    'before:absolute before:top-1 before:bottom-1 before:-left-2 before:w-0.5 before:rounded-full before:bg-purple-400',
            )}
        >
            <div className="min-w-0 flex-1">
                {prop.type === 'switch' ? (
                    <div className="flex h-7 items-center justify-between">
                        <span className="text-foreground-secondary truncate text-[11px]">
                            {prop.name}
                        </span>
                        <Switch
                            checked={Boolean(effective)}
                            onCheckedChange={(checked) => onCommit(prop, checked)}
                        />
                    </div>
                ) : prop.type === 'variant' ? (
                    <div className="flex h-7 items-center justify-between gap-2">
                        <span className="text-foreground-secondary shrink-0 text-[11px]">
                            {prop.name}
                        </span>
                        <SelectField
                            className="max-w-[140px]"
                            value={String(effective ?? '')}
                            options={(prop.options ?? []).map((option) => ({
                                value: option,
                                label: option,
                            }))}
                            onCommit={(next) => onCommit(prop, next)}
                        />
                    </div>
                ) : (
                    <LabeledTextInput
                        label={prop.name}
                        value={effective == null ? '' : String(effective)}
                        placeholder={prop.defaultValue == null ? '—' : String(prop.defaultValue)}
                        onCommit={(next) => {
                            if (prop.type === 'number') {
                                const parsed = Number(next);
                                if (Number.isNaN(parsed)) return;
                                onCommit(prop, parsed);
                            } else {
                                onCommit(prop, next);
                            }
                        }}
                    />
                )}
            </div>
            {isOverridden && (
                <button
                    type="button"
                    title="Reset to default"
                    aria-label={`Reset ${prop.name} to default`}
                    className="text-foreground-tertiary hover:text-foreground-primary invisible h-4 w-4 shrink-0 group-hover/prop:visible"
                    onClick={() => onReset(prop)}
                >
                    <Icons.Reset className="h-2.5 w-2.5" />
                </button>
            )}
        </div>
    );
};
