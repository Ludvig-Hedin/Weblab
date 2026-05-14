import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ShadcnBlockCategory, ShadcnBlockManifestItem } from '@weblab/constants';
import type { DropElementProperties } from '@weblab/models/element';
import { SHADCN_BLOCKS, SHADCN_CORE_COMPONENTS } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { ElementPreset, PresetCategory } from './presets';
import { useEditorEngine } from '@/components/store/editor';
import { BlockPreview } from './block-preview';
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

// Dedupe by `registryName` — if a primitive ships in both lists, the
// groupedBlocks loop would produce duplicate React keys and stale DOM reuse.
const BLOCK_CATALOG = [...SHADCN_BLOCKS, ...SHADCN_CORE_COMPONENTS].filter(
    (block, idx, arr) => arr.findIndex((b) => b.registryName === block.registryName) === idx,
);

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

    // Two ways to insert from the panel:
    //   1. Drag a card onto the canvas — handled by the canvas/frame drop
    //      listeners which read `application/json` from the dataTransfer.
    //   2. Click a card to "arm" it; the next click on a frame drops it. The
    //      gesture screen reads `pendingInsertElement` / `pendingInsertBlock`
    //      and places at the cursor. This is the click-to-add fallback.
    // Drag start clears any armed click-to-place state so the two flows can't
    // collide.
    const pendingElement = editorEngine.state.pendingInsertElement;
    const pendingBlock = editorEngine.state.pendingInsertBlock;

    const handlePresetDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, properties: DropElementProperties) => {
            event.dataTransfer.setData('application/json', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
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
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handlePresetClick = useCallback(
        (preset: ElementPreset) => {
            // Reference equality is exact here because `ELEMENT_PRESETS` is a
            // module-scope const and we stash `preset.properties` (the same
            // ref) into state on arm. Compares-by-fields would collide for
            // two presets that happen to share `tagName + textContent`.
            if (pendingElement === preset.properties) {
                editorEngine.state.setPendingInsertElement(null);
                return;
            }
            editorEngine.state.setPendingInsertBlock(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.state.setPendingInsertElement(preset.properties);
            toast(`Click anywhere on a frame to place ${preset.label}`, {
                description: 'Press Esc to cancel.',
                duration: 4000,
            });
        },
        [editorEngine.state, pendingElement],
    );

    const handleBlockClick = useCallback(
        (block: ShadcnBlockManifestItem) => {
            if (pendingBlock?.registryName === block.registryName) {
                editorEngine.state.setPendingInsertBlock(null);
                return;
            }
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setPendingInsertComponent(null);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.state.setPendingInsertBlock(block);
            toast(`Click anywhere on a frame to place ${block.label}`, {
                description: 'Press Esc to cancel.',
                duration: 4000,
            });
        },
        [editorEngine.state, pendingBlock?.registryName],
    );

    /** Click-handling for non-installed blocks: surface the install command. */
    const handleUninstalledBlockClick = useCallback((block: ShadcnBlockManifestItem) => {
        toast.error('Block is not installed', {
            description: `Run bunx --bun shadcn@latest add @shadcnblocks/${block.registryName}`,
        });
    }, []);

    // Esc cancels an armed click-to-place.
    useEffect(() => {
        if (!pendingElement && !pendingBlock) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                editorEngine.state.setPendingInsertElement(null);
                editorEngine.state.setPendingInsertBlock(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editorEngine.state, pendingElement, pendingBlock]);

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
        <div className="text-active text-mini flex h-full w-full flex-col overflow-hidden">
            <div className="px-3 pt-3 pb-2">
                <div className="border-border-primary/50 flex items-center gap-4 border-b">
                    {(['elements', 'blocks'] as Mode[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setMode(value)}
                            className={cn(
                                'text-small -mb-px border-b-2 px-1 pb-2 capitalize transition-colors',
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
                        className="text-mini h-8 pr-8 pl-7"
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
                                        className="text-foreground-primary text-small flex w-full items-center justify-between px-1 py-1 font-medium"
                                        onClick={() => toggleCategory(value)}
                                        aria-expanded={!isCollapsed}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {label}
                                            <span className="text-muted-foreground text-[10px] font-normal">
                                                {presets.length}
                                            </span>
                                        </span>
                                        <Icons.ChevronDown
                                            className={cn(
                                                'text-muted-foreground h-3.5 w-3.5 transition-transform',
                                                isCollapsed && '-rotate-90',
                                            )}
                                        />
                                    </button>
                                    {!isCollapsed && (
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {presets.map((preset) => {
                                                const isArmed =
                                                    pendingElement === preset.properties;
                                                return (
                                                    <PresetCard
                                                        key={preset.key}
                                                        preset={preset}
                                                        isArmed={isArmed}
                                                        onDragStart={handlePresetDragStart}
                                                        onClick={handlePresetClick}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredPresets.length === 0 && (
                            <div className="text-muted-foreground text-mini flex items-center justify-center py-12">
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
                                        className="text-foreground-primary text-small flex w-full items-center justify-between px-1 py-1 font-medium"
                                        onClick={() => toggleBlockCategory(value)}
                                        aria-expanded={!isCollapsed}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {label}
                                            <span className="text-muted-foreground text-[10px] font-normal">
                                                {blocks.length}
                                            </span>
                                        </span>
                                        <Icons.ChevronDown
                                            className={cn(
                                                'text-muted-foreground h-3.5 w-3.5 transition-transform',
                                                isCollapsed && '-rotate-90',
                                            )}
                                        />
                                    </button>
                                    {!isCollapsed && (
                                        <div className="grid grid-cols-2 gap-2">
                                            {blocks.map((block) => (
                                                <BlockCard
                                                    key={block.registryName}
                                                    block={block}
                                                    isArmed={
                                                        pendingBlock?.registryName ===
                                                        block.registryName
                                                    }
                                                    onDragStart={handleBlockDragStart}
                                                    onClick={handleBlockClick}
                                                    onUninstalledClick={handleUninstalledBlockClick}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredBlocks.length === 0 && (
                            <div className="text-muted-foreground text-mini flex items-center justify-center py-12">
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
    isArmed: boolean;
    onDragStart: (
        event: React.DragEvent<HTMLButtonElement>,
        properties: DropElementProperties,
    ) => void;
    onClick: (preset: ElementPreset) => void;
}

// Card for an element preset. Two interaction paths:
//   - drag onto canvas to drop at the cursor location
//   - click to "arm" — next click on a frame places it at the cursor
// `isArmed` lifts the card so users can see which preset will be placed.
const PresetCard = ({ preset, isArmed, onDragStart, onClick }: PresetCardProps) => {
    const Icon = Icons[preset.icon] as React.ComponentType<{ className?: string }> | undefined;
    const disabled = Boolean(preset.comingSoon);

    const card = (
        <button
            type="button"
            draggable={!disabled}
            aria-disabled={disabled}
            aria-pressed={isArmed}
            onDragStart={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onDragStart(event, preset.properties);
            }}
            onClick={() => {
                if (disabled) return;
                onClick(preset);
            }}
            disabled={disabled}
            className={cn(
                'group bg-background-tab-strip/60 hover:bg-background-tab-active border-border/60 hover:border-border relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border p-2 transition-colors',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                isArmed &&
                    'border-foreground-brand bg-foreground-brand/10 ring-foreground-brand/20 hover:bg-foreground-brand/15 ring-2 ring-offset-0',
            )}
        >
            {Icon ? (
                <Icon className="text-foreground-primary h-5 w-5" />
            ) : (
                <Icons.Square className="text-foreground-primary h-5 w-5" />
            )}
            <span className="text-foreground-primary line-clamp-1 text-[11px]">{preset.label}</span>
            {disabled && (
                <span className="bg-background/80 text-muted-foreground absolute top-1 right-1 rounded px-1 py-0.5 text-[8px]">
                    Soon
                </span>
            )}
        </button>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent side="right" hideArrow>
                <span className="block font-medium">{preset.label}</span>
                {preset.description && (
                    <span className="text-muted-foreground block text-[10px]">
                        {preset.description}
                    </span>
                )}
                <span className="text-muted-foreground mt-0.5 block text-[10px]">
                    {disabled
                        ? 'Coming soon'
                        : isArmed
                          ? 'Armed — click on a frame to place. Esc to cancel.'
                          : 'Drag onto a frame, or click then click on a frame'}
                </span>
            </TooltipContent>
        </Tooltip>
    );
};

interface BlockCardProps {
    block: ShadcnBlockManifestItem;
    isArmed: boolean;
    onDragStart: (
        event: React.DragEvent<HTMLButtonElement>,
        block: ShadcnBlockManifestItem,
    ) => void;
    onClick: (block: ShadcnBlockManifestItem) => void;
    onUninstalledClick: (block: ShadcnBlockManifestItem) => void;
}

// Block card with a category-aware preview thumbnail. Installed blocks support
// both drag-onto-canvas and click-to-arm placement. Uninstalled blocks surface
// the install command on click so the user has a path forward.
const BlockCard = ({
    block,
    isArmed,
    onDragStart,
    onClick,
    onUninstalledClick,
}: BlockCardProps) => {
    const disabled = !block.installed;

    const card = (
        <button
            type="button"
            draggable={!disabled}
            aria-disabled={disabled}
            aria-pressed={isArmed}
            onDragStart={(event) => {
                if (disabled) {
                    event.preventDefault();
                    return;
                }
                onDragStart(event, block);
            }}
            onClick={() => {
                if (disabled) {
                    onUninstalledClick(block);
                    return;
                }
                onClick(block);
            }}
            className={cn(
                'group bg-background-tab-strip/60 hover:bg-background-tab-active border-border/60 hover:border-border relative flex flex-col gap-2 overflow-hidden rounded-md border p-2 text-left transition-colors',
                disabled ? 'cursor-help opacity-60' : 'cursor-pointer',
                isArmed &&
                    'border-foreground-brand bg-foreground-brand/10 ring-foreground-brand/20 hover:bg-foreground-brand/15 ring-2 ring-offset-0',
            )}
        >
            <BlockPreview category={block.category} seed={block.registryName} />
            <div className="flex flex-col gap-0.5">
                <span className="text-foreground-primary line-clamp-1 text-[11px] font-medium">
                    {block.label}
                </span>
                <span className="text-muted-foreground line-clamp-1 text-[10px]">
                    {block.description}
                </span>
            </div>
            {disabled && (
                <span className="bg-background/80 text-muted-foreground absolute top-1 right-1 rounded px-1 py-0.5 text-[8px]">
                    Install
                </span>
            )}
        </button>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent side="right" hideArrow>
                <span className="block font-medium">{block.label}</span>
                <span className="text-muted-foreground block text-[10px]">{block.description}</span>
                <span className="text-muted-foreground mt-0.5 block text-[10px]">
                    {disabled
                        ? 'Click to see install command'
                        : isArmed
                          ? 'Armed — click on a frame to place. Esc to cancel.'
                          : 'Drag onto a frame, or click then click on a frame'}
                </span>
            </TooltipContent>
        </Tooltip>
    );
};
