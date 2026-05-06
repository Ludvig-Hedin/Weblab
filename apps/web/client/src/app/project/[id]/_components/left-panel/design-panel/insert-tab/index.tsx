import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ShadcnBlockCategory, ShadcnBlockManifestItem } from '@weblab/constants';
import type { DropElementProperties } from '@weblab/models/element';
import { SHADCN_BLOCKS, SHADCN_CORE_COMPONENTS } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { ElementPreset, PresetCategory } from './presets';
import { useEditorEngine } from '@/components/store/editor';
import { ELEMENT_PRESETS, PRESET_CATEGORIES } from './presets';

type Mode = 'elements' | 'blocks';

const BLOCK_CATEGORIES: { value: ShadcnBlockCategory; label: string }[] = [
    { value: 'cta', label: 'Calls to Action' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'company', label: 'Company' },
    { value: 'content', label: 'Content' },
    { value: 'commerce', label: 'Commerce' },
    { value: 'help', label: 'Help' },
    { value: 'logos', label: 'Logos' },
    { value: 'primitive', label: 'UI Primitives' },
];

const BLOCK_CATALOG = [...SHADCN_BLOCKS, ...SHADCN_CORE_COMPONENTS];

export const InsertTab = observer(() => {
    const editorEngine = useEditorEngine();
    const [mode, setMode] = useState<Mode>('elements');
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<PresetCategory, boolean>>(() => ({
        structure: false,
        basic: false,
        typography: false,
        media: false,
        forms: false,
        advanced: false,
    }));
    const [collapsedBlocks, setCollapsedBlocks] = useState<Record<ShadcnBlockCategory, boolean>>(
        () => ({
            cta: false,
            logos: false,
            company: false,
            content: false,
            commerce: false,
            help: false,
            analytics: false,
            primitive: false,
        }),
    );

    const filteredPresets = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return ELEMENT_PRESETS;
        return ELEMENT_PRESETS.filter((preset) =>
            [preset.label, preset.description, preset.key]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query),
        );
    }, [searchQuery]);

    const groupedPresets = useMemo(() => {
        const groups: Record<PresetCategory, ElementPreset[]> = {
            structure: [],
            basic: [],
            typography: [],
            media: [],
            forms: [],
            advanced: [],
        };
        for (const preset of filteredPresets) {
            groups[preset.category].push(preset);
        }
        return groups;
    }, [filteredPresets]);

    const filteredBlocks = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return BLOCK_CATALOG;
        return BLOCK_CATALOG.filter((block) =>
            [block.label, block.description, block.registryName, block.componentName]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query),
        );
    }, [searchQuery]);

    const groupedBlocks = useMemo(() => {
        const groups: Record<ShadcnBlockCategory, ShadcnBlockManifestItem[]> = {
            cta: [],
            logos: [],
            company: [],
            content: [],
            commerce: [],
            help: [],
            analytics: [],
            primitive: [],
        };
        for (const block of filteredBlocks) {
            groups[block.category].push(block);
        }
        return groups;
    }, [filteredBlocks]);

    const handlePresetDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, properties: DropElementProperties) => {
            event.dataTransfer.setData('application/json', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handlePresetClick = useCallback(
        (preset: ElementPreset) => {
            if (preset.comingSoon) return;
            editorEngine.state.setPendingInsertElement(preset.properties);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this element.');
        },
        [editorEngine.state],
    );

    const handleBlockDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, block: ShadcnBlockManifestItem) => {
            event.dataTransfer.setData(
                'application/json',
                JSON.stringify({ type: 'shadcn-block', block }),
            );
            event.dataTransfer.setData(
                'application/weblab-block+json',
                JSON.stringify({ type: 'shadcn-block', block }),
            );
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handleBlockClick = useCallback(
        (block: ShadcnBlockManifestItem) => {
            if (!block.installed) {
                toast.error('Block is not installed', {
                    description: `Run bunx --bun shadcn@latest add @shadcnblocks/${block.registryName}`,
                });
                return;
            }
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(block);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this block.');
        },
        [editorEngine.state],
    );

    useEffect(() => {
        setSearchQuery('');
    }, [mode]);

    const toggleCategory = (category: PresetCategory) => {
        setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
    };

    const toggleBlockCategory = (category: ShadcnBlockCategory) => {
        setCollapsedBlocks((prev) => ({ ...prev, [category]: !prev[category] }));
    };

    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Add</span>
            </div>

            <div className="px-3 pb-2">
                <div className="border-border-primary/50 flex items-center gap-4 border-b">
                    {(['elements', 'blocks'] as Mode[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setMode(value)}
                            className={cn(
                                '-mb-px border-b-2 px-1 pb-2 text-sm capitalize transition-colors',
                                mode === value
                                    ? 'border-foreground-primary text-foreground-primary'
                                    : 'text-muted-foreground hover:text-foreground-primary border-transparent',
                            )}
                        >
                            {value}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-3 pb-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        className="h-8 pr-8 pl-7 text-xs"
                        placeholder={mode === 'elements' ? 'Search elements' : 'Search blocks'}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
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
                {mode === 'elements' ? (
                    <div className="flex flex-col gap-3">
                        {PRESET_CATEGORIES.map(({ value, label }) => {
                            const presets = groupedPresets[value];
                            if (presets.length === 0) return null;
                            const isCollapsed = collapsed[value];
                            return (
                                <div key={value} className="flex flex-col gap-1.5">
                                    <button
                                        type="button"
                                        className="text-foreground-primary flex w-full items-center justify-between px-1 py-1 text-sm font-medium"
                                        onClick={() => toggleCategory(value)}
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
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {presets.map((preset) => (
                                                <PresetCard
                                                    key={preset.key}
                                                    preset={preset}
                                                    onDragStart={handlePresetDragStart}
                                                    onClick={handlePresetClick}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredPresets.length === 0 && (
                            <div className="text-muted-foreground flex items-center justify-center py-12 text-xs">
                                No matching elements
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {BLOCK_CATEGORIES.map(({ value, label }) => {
                            const blocks = groupedBlocks[value];
                            if (blocks.length === 0) return null;
                            const isCollapsed = collapsedBlocks[value];
                            return (
                                <div key={value} className="flex flex-col gap-1.5">
                                    <button
                                        type="button"
                                        className="text-foreground-primary flex w-full items-center justify-between px-1 py-1 text-sm font-medium"
                                        onClick={() => toggleBlockCategory(value)}
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
                                            {blocks.map((block) => (
                                                <BlockCard
                                                    key={block.registryName}
                                                    block={block}
                                                    onDragStart={handleBlockDragStart}
                                                    onClick={handleBlockClick}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredBlocks.length === 0 && (
                            <div className="text-muted-foreground flex items-center justify-center py-12 text-xs">
                                No matching blocks
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

interface PresetCardProps {
    preset: ElementPreset;
    onDragStart: (
        event: React.DragEvent<HTMLButtonElement>,
        properties: DropElementProperties,
    ) => void;
    onClick: (preset: ElementPreset) => void;
}

const PresetCard = ({ preset, onDragStart, onClick }: PresetCardProps) => {
    const Icon = Icons[preset.icon] as React.ComponentType<{ className?: string }> | undefined;
    const disabled = Boolean(preset.comingSoon);

    return (
        <button
            type="button"
            draggable={!disabled}
            onDragStart={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onDragStart(event, preset.properties);
            }}
            onClick={() => onClick(preset)}
            disabled={disabled}
            title={preset.description ?? preset.label}
            className={cn(
                'group bg-background-secondary/40 hover:bg-background-weblab border-border-primary/40 hover:border-border-primary relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border p-2 transition-colors',
                disabled &&
                    'hover:bg-background-secondary/40 hover:border-border-primary/40 cursor-not-allowed opacity-40',
            )}
        >
            {Icon ? (
                <Icon className="text-foreground-primary h-5 w-5" />
            ) : (
                <Icons.Square className="text-foreground-primary h-5 w-5" />
            )}
            <span className="text-foreground-primary line-clamp-1 text-[11px]">{preset.label}</span>
            {disabled && (
                <span className="bg-background-weblab/80 text-muted-foreground absolute top-1 right-1 rounded px-1 py-0.5 text-[8px] tracking-wide uppercase">
                    Soon
                </span>
            )}
        </button>
    );
};

interface BlockCardProps {
    block: ShadcnBlockManifestItem;
    onDragStart: (
        event: React.DragEvent<HTMLButtonElement>,
        block: ShadcnBlockManifestItem,
    ) => void;
    onClick: (block: ShadcnBlockManifestItem) => void;
}

const BlockCard = ({ block, onDragStart, onClick }: BlockCardProps) => {
    const disabled = !block.installed;

    return (
        <button
            type="button"
            draggable={!disabled}
            onDragStart={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onDragStart(event, block);
            }}
            onClick={() => onClick(block)}
            disabled={disabled}
            title={block.description}
            className={cn(
                'group bg-background-secondary/40 hover:bg-background-weblab border-border-primary/40 hover:border-border-primary relative flex min-h-24 flex-col items-start justify-between gap-2 rounded-lg border p-2 text-left transition-colors',
                disabled &&
                    'hover:bg-background-secondary/40 hover:border-border-primary/40 cursor-not-allowed opacity-40',
            )}
        >
            <div className="flex w-full items-center justify-between gap-2">
                <Icons.LayoutMasonry className="text-foreground-primary h-4 w-4 shrink-0" />
                <span className="text-muted-foreground truncate text-[10px]">
                    {block.registryName}
                </span>
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-foreground-primary line-clamp-1 text-[11px] font-medium">
                    {block.label}
                </span>
                <span className="text-muted-foreground line-clamp-2 text-[10px] leading-3">
                    {block.description}
                </span>
            </div>
        </button>
    );
};
