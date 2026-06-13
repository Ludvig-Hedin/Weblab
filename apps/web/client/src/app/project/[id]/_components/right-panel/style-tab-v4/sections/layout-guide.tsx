'use client';

import { useCallback, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { v4 as uuid } from 'uuid';

import type { Frame, LayoutGuideConfig, LayoutGuideType } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { IconButtonSm } from '../controls/icon-button-sm';
import { LayoutGuidePopover } from '../controls/layout-guide-popover';
import { Section } from './section';

// Defaults match Figma's "Add layout grid" affordance: a 12-column stretch
// guide tinted red at 10% opacity. Picked once at section construction so
// freshly added guides all start from the same vocabulary.
const DEFAULT_NEW_GUIDE: Omit<LayoutGuideConfig, 'id'> = {
    type: 'columns',
    visible: true,
    color: '#FF000019',
    count: 12,
    alignment: 'stretch',
    width: null,
    margin: 0,
    gutter: 16,
};

// TYPE_LABEL defined inside LayoutGuideSection to use translations

/**
 * Figma-style **Layout guide** section. Lives in the frame-level right panel
 * (rendered by FrameSettingsPanel when a frame is selected but no element).
 *
 * Each row represents one entry in `frame.layoutGuides`. Clicking the row
 * (or its type chip) opens a popover with the full config form; the eye
 * icon flips per-guide visibility; the color swatch is currently a visual
 * indicator (in-popover color editing is the canonical entry point).
 *
 * The section header `+` button appends a default 12-column guide. Empty
 * state renders the same `+` action as a wider centered control so the
 * affordance is discoverable on a frame with no guides yet.
 */
export const LayoutGuideSection = observer(function LayoutGuideSection({
    frame,
}: {
    frame: Frame;
}) {
    const t = useTranslations('editor.stylePanel');
    const editorEngine = useEditorEngine();
    // Memoize the guides array reference so callbacks that close over it
    // don't get re-created every render. Without this, eslint
    // (`react-hooks/exhaustive-deps`) complains that the `guides ?? []`
    // expression produces a fresh array on each render, churning the
    // dependent useCallbacks.
    const guides = useMemo(() => frame.layoutGuides ?? [], [frame.layoutGuides]);
    const setCount = guides.filter((g) => g.visible).length;

    // Track which guide row has its popover open. Multiple popovers shouldn't
    // be open at once — using a single `editingId` state keeps that invariant
    // without prop-drilling open state into each row.
    const [editingId, setEditingId] = useState<string | null>(null);

    const persist = useCallback(
        (next: LayoutGuideConfig[]) => {
            // Whole-array replace — matches the Convex mutation contract. The
            // FramesManager helper handles the local MobX update + debounced
            // persistence so the overlay re-draws immediately.
            void editorEngine.frames.updateLayoutGuides(frame.id, next);
        },
        [editorEngine.frames, frame.id],
    );

    const addGuide = useCallback(() => {
        const next: LayoutGuideConfig = { id: uuid(), ...DEFAULT_NEW_GUIDE };
        const updated = [...guides, next];
        persist(updated);
        setEditingId(next.id);
    }, [guides, persist]);

    const updateGuide = useCallback(
        (id: string, patch: Partial<LayoutGuideConfig>) => {
            const updated = guides.map((g) => (g.id === id ? { ...g, ...patch } : g));
            persist(updated);
        },
        [guides, persist],
    );

    const removeGuide = useCallback(
        (id: string) => {
            persist(guides.filter((g) => g.id !== id));
            setEditingId((current) => (current === id ? null : current));
        },
        [guides, persist],
    );

    const sectionActions = useMemo(
        () => (
            <IconButtonSm label={t('layoutGuide.addLayoutGuide')} onClick={addGuide}>
                <Icons.Plus className="size-3" />
            </IconButtonSm>
        ),
        [addGuide, t],
    );

    return (
        <Section id="layoutGuide" title={t('section.layoutGuide')} setCount={setCount} actions={sectionActions}>
            {guides.length === 0 ? (
                <div className="text-foreground-tertiary px-3 py-2 text-[11px]">
                    {t('layoutGuide.noGuides')}
                </div>
            ) : (
                <div className="flex flex-col">
                    {guides.map((guide) => (
                        <LayoutGuideRow
                            key={guide.id}
                            guide={guide}
                            isEditing={editingId === guide.id}
                            onOpenChange={(open) => setEditingId(open ? guide.id : null)}
                            onChange={(patch) => updateGuide(guide.id, patch)}
                            onRemove={() => removeGuide(guide.id)}
                        />
                    ))}
                </div>
            )}
        </Section>
    );
});

interface LayoutGuideRowProps {
    guide: LayoutGuideConfig;
    isEditing: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (patch: Partial<LayoutGuideConfig>) => void;
    onRemove: () => void;
}

function LayoutGuideRow({
    guide,
    isEditing,
    onOpenChange,
    onChange,
    onRemove,
}: LayoutGuideRowProps) {
    const t = useTranslations('editor.stylePanel');
    const rowTypeLabel: Record<LayoutGuideType, string> = {
        grid: t('layoutGuide.grid'),
        columns: t('layoutGuide.columns'),
        rows: t('layoutGuide.rows'),
    };
    const typeLabel = rowTypeLabel[guide.type];
    const summary = summarizeGuide(guide, t);
    return (
        <div className="hover:bg-background-secondary/60 group flex items-center gap-2 px-3 py-1.5 transition-colors">
            <button
                type="button"
                aria-label={guide.visible ? t('layoutGuide.hideLayoutGuide') : t('layoutGuide.showLayoutGuide')}
                title={guide.visible ? t('layoutGuide.hideLayoutGuide') : t('layoutGuide.showLayoutGuide')}
                onClick={() => onChange({ visible: !guide.visible })}
                className="text-foreground-tertiary hover:text-foreground-primary inline-flex size-[20px] items-center justify-center rounded-xs transition-colors"
            >
                {guide.visible ? (
                    <Icons.EyeOpen className="size-3" />
                ) : (
                    <Icons.EyeClosed className="size-3" />
                )}
            </button>
            <span
                aria-hidden
                className="border-border/40 size-3 shrink-0 rounded-[3px] border"
                style={{ background: guide.color }}
            />
            <LayoutGuidePopover
                guide={guide}
                open={isEditing}
                onOpenChange={onOpenChange}
                onChange={onChange}
                trigger={
                    <button
                        type="button"
                        className="text-foreground-primary hover:text-foreground-primary flex flex-1 items-baseline gap-1.5 truncate text-left text-[12px]"
                    >
                        <span className="font-medium">{typeLabel}</span>
                        <span className="text-foreground-tertiary text-[11px]">{summary}</span>
                    </button>
                }
            />
            <IconButtonSm label={t('layoutGuide.removeLayoutGuide')} onClick={onRemove}>
                <Icons.Trash className="size-3" />
            </IconButtonSm>
        </div>
    );
}

function summarizeGuide(g: LayoutGuideConfig, t: ReturnType<typeof useTranslations<'editor.stylePanel'>>): string {
    if (g.type === 'grid') {
        return `${g.size ?? 10}px`;
    }
    const count = g.count ?? 0;
    const noun =
        g.type === 'columns'
            ? count === 1
                ? t('layoutGuide.column')
                : t('layoutGuide.columns')
            : count === 1
              ? t('layoutGuide.row')
              : t('layoutGuide.rows');
    return `${count} ${noun}`;
}
