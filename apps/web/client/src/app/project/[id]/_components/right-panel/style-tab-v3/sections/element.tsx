'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { ChipInput, PropertyLabel, SelectField, TextField } from '../controls';
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
 * Element section — Class chips, Tag, ID, Link. Mirrors the Figma's top
 * group: a single accordion section that owns the element-level metadata
 * editors. The href editor only renders when the selected element accepts an
 * `href` attribute (i.e. anchor tags) so the row doesn't take space when it
 * can't write anything.
 */
export const ElementSection = observer(function ElementSection() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const [actionElement, setActionElement] = useState<ActionElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
    const classes = useMemo(() => className.split(/\s+/).filter(Boolean), [className]);
    const tagName = actionElement?.tagName ?? selected?.tagName ?? '';
    const supportsHref = tagName === 'a';

    const setCount = (classes.length > 0 ? 1 : 0) + (idValue ? 1 : 0) + (hrefValue ? 1 : 0);

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

    if (!selected) return null;

    // While the async `getActionElement` read is in flight, render the rows in
    // a calm disabled state: inputs can't be typed into (so the user can't race
    // the commit) and the blank-then-pop flash is replaced by a muted look.
    // `ChipInput` supports `readOnly` directly; `SelectField`/`TextField` don't
    // expose a `disabled` prop, so their row wrappers get `pointer-events-none`
    // + reduced opacity instead — visually and functionally inert, no restructure.
    const fieldLoadingClass = isLoading ? 'pointer-events-none opacity-50 select-none' : undefined;

    return (
        <Section id="element" title="Element" setCount={setCount}>
            <div className="group/control flex items-start gap-3 px-3 py-1">
                <PropertyLabel
                    label="Class"
                    isSet={classes.length > 0}
                    title="CSS classes"
                    className="pt-1.5"
                />
                <ChipInput
                    chips={classes}
                    onChange={(next) => void commitClassName(next.join(' '))}
                    placeholder={isLoading ? 'Loading…' : 'Add a class…'}
                    ariaLabel="Add a class"
                    readOnly={isLoading}
                />
            </div>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="Tag" isSet={!!tagName} title="HTML tag" />
                <div className={cn('min-w-0 flex-1', fieldLoadingClass)} aria-busy={isLoading}>
                    <SelectField
                        value={tagName}
                        options={TAG_OPTIONS}
                        onCommit={(v) => void commitTagName(v)}
                    />
                </div>
            </div>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="ID" isSet={!!idValue} title="Element id" />
                <div className={cn('min-w-0 flex-1', fieldLoadingClass)} aria-busy={isLoading}>
                    <TextField
                        value={idValue}
                        placeholder="hero-section"
                        onCommit={(v) => void commitId(v)}
                    />
                </div>
            </div>
            {supportsHref && (
                <div className="group/control flex items-center gap-3 px-3 py-1">
                    <PropertyLabel label="Link" isSet={!!hrefValue} title="Anchor href" />
                    <div className={cn('min-w-0 flex-1', fieldLoadingClass)} aria-busy={isLoading}>
                        <TextField
                            value={hrefValue}
                            placeholder="Page or URL…"
                            onCommit={(v) => void commitHref(v)}
                        />
                    </div>
                </div>
            )}
        </Section>
    );
});
