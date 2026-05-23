'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import {
    ChipInput,
    GroupShell,
    IconButtonSm,
    IconPencil,
    LabeledTextInput,
    OpenInNewTabCheckbox,
    SelectField,
    SmartLinkInput,
} from '../controls';
import { Section } from './section';

const COMMON_TAGS = [
    'div',
    'span',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'nav',
    'aside',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'a',
    'button',
    'ul',
    'ol',
    'li',
    'img',
];

const TAG_OPTIONS = COMMON_TAGS.map((tag) => ({ value: tag, label: tag }));

/**
 * v4 Element section — Tag + ID paired columns, ChipInput classes group
 * with raw-edit popover, and SmartLinkInput link group for anchor elements.
 *
 * Commit pipeline and selection-guard (`isStillSelected`) are copied
 * directly from the v3 implementation to preserve correctness.
 */
export const ElementSection = observer(function ElementSection() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const [actionElement, setActionElement] = useState<ActionElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [rawEditOpen, setRawEditOpen] = useState(false);
    const [rawDraft, setRawDraft] = useState('');
    const [openInNewTab, setOpenInNewTab] = useState(false);

    // Reactive view-readiness signal: reading `.view` here (inside an
    // `observer`) subscribes to the observable FramesManager map, so when
    // `registerView` attaches the iframe view this reference flips from
    // `null` to a value and the effect below re-runs.
    const frameView = selected ? editorEngine.frames.get(selected.frameId)?.view : null;

    useEffect(() => {
        let cancelled = false;
        if (!selected) {
            setActionElement(null);
            setIsLoading(false);
            return;
        }
        // If the frame view isn't connected yet, stay in a loading state — the
        // effect re-runs once `frameView` flips to a live view (it's in deps).
        if (!frameView) {
            setActionElement(null);
            setIsLoading(true);
            return;
        }
        setIsLoading(true);
        void (async () => {
            try {
                const next = await frameView.getActionElement(selected.domId);
                if (!cancelled) setActionElement(next);
            } catch {
                if (!cancelled) setActionElement(null);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [frameView, selected]);

    const className = useMemo(
        () => actionElement?.attributes.className ?? actionElement?.attributes.class ?? '',
        [actionElement],
    );
    const idValue = useMemo(() => actionElement?.attributes.id ?? '', [actionElement]);
    const hrefValue = useMemo(() => actionElement?.attributes.href ?? '', [actionElement]);
    const targetValue = useMemo(() => actionElement?.attributes.target ?? '', [actionElement]);
    const classes = useMemo(() => className.split(/\s+/).filter(Boolean), [className]);
    const tagName = actionElement?.tagName ?? selected?.tagName ?? '';
    const supportsHref = tagName === 'a';

    // Sync open-in-new-tab toggle from loaded element data
    useEffect(() => {
        setOpenInNewTab(targetValue === '_blank');
    }, [targetValue]);

    // setCount removed in v4 — section dot hidden per design brief.

    // Each `commit*` callback does an optimistic `setActionElement` AFTER an
    // await. If the user changes selection mid-await, `current` would be the
    // NEW element's state and the patch would graft the old value onto it.
    // Guard: capture the target identity (oid + domId) before the await and
    // skip the optimistic update if the selection no longer matches — the
    // effect reloads fresh data for the new selection anyway.
    const isStillSelected = useCallback(
        (oid: string, domId: string) => {
            const current = editorEngine.elements.selected[0];
            return current?.oid === oid && current?.domId === domId;
        },
        [editorEngine.elements],
    );

    const commitTagName = useCallback(
        async (value: string) => {
            if (!selected?.oid) {
                toast.error("Can't retag this element from here yet.");
                return;
            }
            const next = value.trim().toLowerCase();
            if (!/^[a-z][a-z0-9-]*$/.test(next)) {
                toast.error('Use a lowercase HTML tag name.');
                return;
            }
            const targetOid = selected.oid;
            const targetDomId = selected.domId;
            await editorEngine.code.updateElementMetadata({
                oid: targetOid,
                branchId: selected.branchId,
                tagName: next,
            });
            if (!isStillSelected(targetOid, targetDomId)) return;
            setActionElement((current) => (current ? { ...current, tagName: next } : current));
        },
        [editorEngine.code, selected?.branchId, selected?.domId, selected?.oid, isStillSelected],
    );

    const commitClassName = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            const targetOid = selected.oid;
            const targetDomId = selected.domId;
            await editorEngine.code.updateElementMetadata({
                oid: targetOid,
                branchId: selected.branchId,
                attributes: { className: next.trim() },
                overrideClasses: true,
            });
            if (!isStillSelected(targetOid, targetDomId)) return;
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, className: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.domId, selected?.oid, isStillSelected],
    );

    const commitId = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            const targetOid = selected.oid;
            const targetDomId = selected.domId;
            await editorEngine.code.updateElementMetadata({
                oid: targetOid,
                branchId: selected.branchId,
                attributes: { id: next.trim() },
            });
            if (!isStillSelected(targetOid, targetDomId)) return;
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, id: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.domId, selected?.oid, isStillSelected],
    );

    const commitHref = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            const targetOid = selected.oid;
            const targetDomId = selected.domId;
            await editorEngine.code.updateElementMetadata({
                oid: targetOid,
                branchId: selected.branchId,
                attributes: { href: next.trim() },
            });
            if (!isStillSelected(targetOid, targetDomId)) return;
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, href: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.domId, selected?.oid, isStillSelected],
    );

    const commitTarget = useCallback(
        async (checked: boolean) => {
            if (!selected?.oid) return;
            const targetOid = selected.oid;
            const targetDomId = selected.domId;
            const newTarget = checked ? '_blank' : '';
            const newRel = checked ? 'noreferrer' : '';
            setOpenInNewTab(checked);
            await editorEngine.code.updateElementMetadata({
                oid: targetOid,
                branchId: selected.branchId,
                attributes: { target: newTarget, rel: newRel },
            });
            if (!isStillSelected(targetOid, targetDomId)) return;
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: {
                              ...current.attributes,
                              target: newTarget,
                              rel: newRel,
                          },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.domId, selected?.oid, isStillSelected],
    );

    if (!selected) return null;

    // While the async `getActionElement` read is in flight, non-chip groups
    // are rendered inert via pointer-events-none + opacity reduction.
    // ChipInput supports `readOnly` directly.
    const fieldLoadingClass = isLoading ? 'pointer-events-none opacity-50 select-none' : undefined;

    // Build page list from engine for SmartLinkInput. Gracefully degrade to []
    // if pages manager or flatPages getter isn't populated yet.
    const pagesList = (editorEngine.pages?.flatPages ?? []).map((p) => ({
        id: p.id,
        title: p.name || p.slug || p.path,
        path: p.path,
    }));

    return (
        <Section id="element" title="Element">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* 1. Tag + ID — 2-col grid */}
                <div className={cn('grid grid-cols-2 gap-2', fieldLoadingClass)}>
                    <GroupShell label="Tag">
                        <SelectField
                            value={tagName}
                            options={TAG_OPTIONS}
                            onCommit={(v) => void commitTagName(v)}
                        />
                    </GroupShell>
                    <GroupShell label="ID">
                        <LabeledTextInput
                            glyph="#"
                            mono
                            value={idValue}
                            placeholder="hero-section"
                            aria-label="Element ID"
                            onCommit={(v) => void commitId(v)}
                        />
                    </GroupShell>
                </div>

                {/* 2. Classes — chip input with raw-edit popover */}
                <GroupShell
                    label="Classes"
                    actions={
                        <Popover open={rawEditOpen} onOpenChange={setRawEditOpen}>
                            <PopoverTrigger asChild>
                                <IconButtonSm
                                    label="Edit raw className"
                                    pressed={rawEditOpen}
                                    onClick={() => {
                                        setRawDraft(className);
                                        setRawEditOpen(true);
                                    }}
                                >
                                    <IconPencil size={12} />
                                </IconButtonSm>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                side="bottom"
                                sideOffset={4}
                                className="w-[240px] rounded-md p-2"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                                <textarea
                                    value={rawDraft}
                                    onChange={(e) => setRawDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            void commitClassName(rawDraft);
                                            setRawEditOpen(false);
                                        } else if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setRawEditOpen(false);
                                        }
                                    }}
                                    onBlur={() => {
                                        void commitClassName(rawDraft);
                                        setRawEditOpen(false);
                                    }}
                                    rows={4}
                                    spellCheck={false}
                                    className="text-foreground-primary placeholder:text-muted-foreground bg-background-secondary w-full resize-none rounded-[10px] p-2 font-mono text-[11.5px] outline-none"
                                    placeholder="Paste or type Tailwind classes…"
                                    aria-label="Raw className editor"
                                />
                            </PopoverContent>
                        </Popover>
                    }
                >
                    <ChipInput
                        chips={classes}
                        onChange={(next) => void commitClassName(next.join(' '))}
                        ariaLabel="Add a class"
                        readOnly={isLoading}
                    />
                </GroupShell>

                {/* 3. Link — anchor-only, with smart autocomplete + new-tab toggle */}
                {supportsHref && (
                    <GroupShell
                        label="Link"
                        actions={
                            hrefValue ? (
                                <OpenInNewTabCheckbox
                                    checked={openInNewTab}
                                    onChange={(checked) => void commitTarget(checked)}
                                />
                            ) : undefined
                        }
                    >
                        <div className={fieldLoadingClass}>
                            <SmartLinkInput
                                value={hrefValue}
                                pages={pagesList}
                                files={[]}
                                onCommit={(href) => void commitHref(href)}
                            />
                        </div>
                    </GroupShell>
                )}
            </div>
        </Section>
    );
});
