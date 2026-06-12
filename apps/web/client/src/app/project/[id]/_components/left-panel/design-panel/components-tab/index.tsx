'use client';

import { useCallback, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ComponentInsertData, DropElementProperties } from '@weblab/models/element';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import type { ComponentTemplate } from './templates';
import { useEditorEngine } from '@/components/store/editor';
import { ComponentCard } from './component-card';
import { COMPONENT_TEMPLATES, TEMPLATE_CATEGORIES } from './templates';

export const ComponentsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    // Discovered from the code-derived component index (code is truth);
    // updates reactively as files are written or the branch changes.
    const userComponents = useMemo<ComponentInsertData[]>(
        () =>
            editorEngine.components.definitions
                .filter((def) => def.kind === 'react')
                .map((def) => ({
                    componentName: def.name,
                    filePath: def.filePath,
                    exportType: def.exportType,
                    key: def.key,
                }))
                .sort((a, b) => a.componentName.localeCompare(b.componentName)),
        [editorEngine.components.definitions],
    );
    const isLoadingComponents = !editorEngine.components.indexReady;

    const filteredUserComponents = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return userComponents;
        return userComponents.filter((c) =>
            [c.componentName, c.filePath].join(' ').toLowerCase().includes(q),
        );
    }, [userComponents, searchQuery]);

    const filteredTemplates = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return COMPONENT_TEMPLATES;
        return COMPONENT_TEMPLATES.filter((t) =>
            [t.label, t.description, t.key].join(' ').toLowerCase().includes(q),
        );
    }, [searchQuery]);

    const groupedTemplates = useMemo(() => {
        const groups: Record<string, ComponentTemplate[]> = {};
        for (const t of filteredTemplates) {
            (groups[t.category] ??= []).push(t);
        }
        return groups;
    }, [filteredTemplates]);

    const handleTemplateDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, properties: DropElementProperties) => {
            event.dataTransfer.setData('application/json', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    // Drag-only path: starting a drag clears any leftover pending-insert state
    // and ensures we're in DESIGN mode so the gesture screen accepts the drop.
    // Click-to-place was removed because the drag affordance is clearer and
    // the click flow had several broken edge cases.
    const handleComponentDragStart = useCallback(
        (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => {
            e.dataTransfer.setData('application/weblab-component', JSON.stringify(data));
            e.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    return (
        <div className="text-active text-mini flex h-full w-full flex-col overflow-hidden">
            <div className="px-3 pt-3 pb-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        className="text-mini h-8 pr-8 pl-7"
                        placeholder="Search templates"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground-primary absolute top-1/2 right-2 -translate-y-1/2"
                            onClick={() => setSearchQuery('')}
                        >
                            <Icons.CrossS className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto px-3 pb-4">
                <div className="flex flex-col gap-3">
                    {/* Components discovered in the project source */}
                    <div className="mb-1 flex flex-col gap-1.5">
                        <span className="text-foreground-primary text-small px-1 py-1 font-medium">
                            Components
                        </span>
                        {isLoadingComponents ? (
                            <p className="text-muted-foreground text-mini px-1 py-4 text-center">
                                Indexing components…
                            </p>
                        ) : !filteredUserComponents.length ? (
                            <p className="text-muted-foreground text-mini px-1 py-4 text-center">
                                {searchQuery
                                    ? 'No matching components'
                                    : 'No components yet. Exported React components appear here automatically.'}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {filteredUserComponents.map((comp) => (
                                    <ComponentCard
                                        key={comp.key ?? `${comp.filePath}:${comp.componentName}`}
                                        data={comp}
                                        onDragStart={handleComponentDragStart}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {TEMPLATE_CATEGORIES.map(({ value, label }) => {
                        const templates = groupedTemplates[value] ?? [];
                        if (templates.length === 0) return null;
                        const isCollapsed = collapsed[value];
                        return (
                            <div key={value} className="flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    className="text-foreground-primary text-small flex w-full items-center justify-between px-1 py-1 font-medium"
                                    onClick={() =>
                                        setCollapsed((p) => ({ ...p, [value]: !p[value] }))
                                    }
                                    aria-expanded={!isCollapsed}
                                >
                                    <span>{label}</span>
                                    <Icons.ChevronDown
                                        className={cn(
                                            'text-muted-foreground h-3.5 w-3.5 transition-transform',
                                            isCollapsed && '-rotate-90',
                                        )}
                                    />
                                </button>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {templates.map((template) => (
                                            <TemplateCard
                                                key={template.key}
                                                template={template}
                                                onDragStart={handleTemplateDragStart}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {filteredTemplates.length === 0 && (
                        <div className="text-muted-foreground text-mini flex items-center justify-center py-12">
                            No matching templates
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

interface TemplateCardProps {
    template: ComponentTemplate;
    onDragStart: (e: React.DragEvent<HTMLButtonElement>, p: DropElementProperties) => void;
}

const TemplateCard = ({ template, onDragStart }: TemplateCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, template.properties)}
        title={`${template.label} — drag to canvas`}
        className="group bg-background-tab-strip/60 hover:bg-background-tab-active border-border/60 hover:border-border relative flex aspect-video cursor-grab flex-col items-center justify-center gap-1.5 rounded-md border p-2 transition-colors active:cursor-grabbing"
    >
        <Icons.Component className="text-foreground-primary h-5 w-5" />
        <span className="text-foreground-primary line-clamp-1 text-[11px]">{template.label}</span>
    </button>
);
