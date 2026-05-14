'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { toast } from '@weblab/ui/sonner';

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

    useEffect(() => {
        let cancelled = false;
        if (!selected) {
            setActionElement(null);
            return;
        }
        const frameData = editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) {
            setActionElement(null);
            return;
        }
        void (async () => {
            try {
                const next = await frameData.view!.getActionElement(selected.domId);
                if (!cancelled) setActionElement(next);
            } catch {
                if (!cancelled) setActionElement(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editorEngine.frames, selected]);

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
            await editorEngine.code.updateElementMetadata({
                oid: selected.oid,
                branchId: selected.branchId,
                tagName: next,
            });
            setActionElement((current) => (current ? { ...current, tagName: next } : current));
        },
        [editorEngine.code, selected?.branchId, selected?.oid],
    );

    const commitClassName = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            await editorEngine.code.updateElementMetadata({
                oid: selected.oid,
                branchId: selected.branchId,
                attributes: { className: next.trim() },
                overrideClasses: true,
            });
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, className: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.oid],
    );

    const commitId = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            await editorEngine.code.updateElementMetadata({
                oid: selected.oid,
                branchId: selected.branchId,
                attributes: { id: next.trim() },
            });
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, id: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.oid],
    );

    const commitHref = useCallback(
        async (next: string) => {
            if (!selected?.oid) {
                toast.error("Can't edit this element from here yet.");
                return;
            }
            await editorEngine.code.updateElementMetadata({
                oid: selected.oid,
                branchId: selected.branchId,
                attributes: { href: next.trim() },
            });
            setActionElement((current) =>
                current
                    ? {
                          ...current,
                          attributes: { ...current.attributes, href: next.trim() },
                      }
                    : current,
            );
        },
        [editorEngine.code, selected?.branchId, selected?.oid],
    );

    if (!selected) return null;

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
                    placeholder="Add a class…"
                    ariaLabel="Add a class"
                />
            </div>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="Tag" isSet={!!tagName} title="HTML tag" />
                <div className="min-w-0 flex-1">
                    <SelectField
                        value={tagName}
                        options={TAG_OPTIONS}
                        onCommit={(v) => void commitTagName(v)}
                    />
                </div>
            </div>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="ID" isSet={!!idValue} title="Element id" />
                <div className="min-w-0 flex-1">
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
                    <div className="min-w-0 flex-1">
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
