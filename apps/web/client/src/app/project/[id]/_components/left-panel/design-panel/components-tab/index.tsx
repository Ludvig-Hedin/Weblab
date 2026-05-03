'use client';
import { useCallback, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ComponentInsertData, DropElementProperties } from '@weblab/models/element';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';
import { ComponentCard } from './component-card';
import type { ComponentTemplate } from './templates';
import { COMPONENT_TEMPLATES, TEMPLATE_CATEGORIES } from './templates';

export const ComponentsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const { data: userComponents, isLoading: isLoadingComponents } =
        api.components.listProjectComponents.useQuery({}, { staleTime: 30_000 });

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

    const handleTemplateClick = useCallback(
        (template: ComponentTemplate) => {
            editorEngine.state.setPendingInsertElement(template.properties);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this component.');
        },
        [editorEngine.state],
    );

    const handleComponentDragStart = useCallback(
        (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => {
            e.dataTransfer.setData('application/weblab-component', JSON.stringify(data));
            e.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handleComponentClick = useCallback(
        (data: ComponentInsertData) => {
            editorEngine.state.setPendingInsertComponent(data);
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this component.');
        },
        [editorEngine.state],
    );

    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Components</span>
            </div>

            <div className="px-3 pb-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        className="h-8 pr-8 pl-7 text-xs"
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
                    {/* My Components section */}
                    <div className="mb-1 flex flex-col gap-1.5">
                        <span className="text-foreground-primary px-1 py-1 text-sm font-medium">
                            My Components
                        </span>
                        {isLoadingComponents ? (
                            <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                                Scanning project…
                            </p>
                        ) : !userComponents?.length ? (
                            <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                                No components found in src/
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {userComponents.map((comp) => (
                                    <ComponentCard
                                        key={`${comp.filePath}:${comp.componentName}`}
                                        data={comp}
                                        onDragStart={handleComponentDragStart}
                                        onClick={handleComponentClick}
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
                                    className="text-foreground-primary flex w-full items-center justify-between px-1 py-1 text-sm font-medium"
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
                                                onClick={handleTemplateClick}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {filteredTemplates.length === 0 && (
                        <div className="text-muted-foreground flex items-center justify-center py-12 text-xs">
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
    onClick: (t: ComponentTemplate) => void;
}

const TemplateCard = ({ template, onDragStart, onClick }: TemplateCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, template.properties)}
        onClick={() => onClick(template)}
        title={template.description}
        className="group bg-background-secondary/40 hover:bg-background-onlook border-border-primary/40 hover:border-border-primary relative flex aspect-video flex-col items-center justify-center gap-1.5 rounded-lg border p-2 transition-colors"
    >
        <Icons.Component className="text-foreground-primary h-5 w-5" />
        <span className="text-foreground-primary line-clamp-1 text-[11px]">{template.label}</span>
    </button>
);
