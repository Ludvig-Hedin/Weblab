import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { DropElementProperties } from '@weblab/models/element';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { ElementPreset, PresetCategory } from './presets';
import { useEditorEngine } from '@/components/store/editor';
import { ELEMENT_PRESETS, PRESET_CATEGORIES } from './presets';

type Mode = 'elements' | 'layouts';

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

    const handlePresetDragStart = useCallback(
        (event: React.DragEvent<HTMLButtonElement>, properties: DropElementProperties) => {
            event.dataTransfer.setData('application/json', JSON.stringify(properties));
            event.dataTransfer.effectAllowed = 'copy';
            editorEngine.state.setPendingInsertElement(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        },
        [editorEngine.state],
    );

    const handlePresetClick = useCallback(
        (preset: ElementPreset) => {
            if (preset.comingSoon) return;
            editorEngine.state.setPendingInsertElement(preset.properties);
            editorEngine.state.setInsertMode(null);
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            toast('Click on the canvas to place this element.');
        },
        [editorEngine.state],
    );

    useEffect(() => {
        setSearchQuery('');
    }, [mode]);

    const toggleCategory = (category: PresetCategory) => {
        setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
    };

    return (
        <div className="text-active flex h-full w-full flex-col overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-foreground-primary text-sm font-medium">Add</span>
            </div>

            <div className="px-3 pb-2">
                <div className="border-border-primary/50 flex items-center gap-4 border-b">
                    {(['elements', 'layouts'] as Mode[]).map((value) => (
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

            {mode === 'elements' && (
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                        <Input
                            className="h-8 pr-8 pl-7 text-xs"
                            placeholder="Search elements"
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
            )}

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
                    <LayoutsEmptyState />
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

const LayoutsEmptyState = () => (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="bg-background-secondary/40 border-border-primary/40 flex h-12 w-12 items-center justify-center rounded-xl border">
            <Icons.LayoutMasonry className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1">
            <p className="text-foreground-primary text-sm font-medium">Section templates</p>
            <p className="text-xs">Pre-built sections are coming soon.</p>
        </div>
    </div>
);
