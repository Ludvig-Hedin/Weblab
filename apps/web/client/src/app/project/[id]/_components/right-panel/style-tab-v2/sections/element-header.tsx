'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';

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
 * Top-of-panel block: tag picker, id, className chips, plus a placeholder
 * "Style selector" pill for future class-scoped editing. This is rendered
 * outside the accordion since users almost always need it visible.
 */
export const ElementHeaderSection = observer(function ElementHeaderSection() {
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
    const classes = useMemo(() => className.split(/\s+/).filter(Boolean), [className]);

    if (!selected) return null;

    const tagName = actionElement?.tagName ?? selected.tagName;

    const commitTagName = async (value: string) => {
        if (!selected.oid) {
            toast.error('This element cannot be retagged from the styles panel yet.');
            return;
        }
        const next = value.trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(next)) {
            toast.error('Use a valid lowercase HTML tag name.');
            return;
        }
        await editorEngine.code.updateElementMetadata({
            oid: selected.oid,
            branchId: selected.branchId,
            tagName: next,
        });
        setActionElement((current) => (current ? { ...current, tagName: next } : current));
    };

    const commitClassName = async (next: string) => {
        if (!selected.oid) {
            toast.error('This element cannot be edited from the styles panel yet.');
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
    };

    const commitId = async (next: string) => {
        if (!selected.oid) {
            toast.error('This element cannot be edited from the styles panel yet.');
            return;
        }
        await editorEngine.code.updateElementMetadata({
            oid: selected.oid,
            branchId: selected.branchId,
            attributes: { id: next.trim() },
        });
        setActionElement((current) =>
            current
                ? { ...current, attributes: { ...current.attributes, id: next.trim() } }
                : current,
        );
    };

    const removeClass = (cls: string) => {
        const remaining = classes.filter((c) => c !== cls).join(' ');
        void commitClassName(remaining);
    };

    return (
        <div className="border-border/40 flex flex-col gap-2 border-b px-3 py-3">
            <div className="flex items-center gap-2">
                <span className="text-foreground-secondary text-mini w-12 shrink-0">Tag</span>
                <SelectField
                    value={tagName}
                    options={TAG_OPTIONS}
                    onCommit={(v) => void commitTagName(v)}
                    className="flex-1"
                />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-foreground-secondary text-mini w-12 shrink-0">ID</span>
                <TextField
                    value={idValue}
                    placeholder="hero-section"
                    onCommit={(v) => void commitId(v)}
                />
            </div>
            <div className="flex items-start gap-2">
                <span className="text-foreground-secondary text-mini w-12 shrink-0 pt-1.5">
                    Class
                </span>
                <div className="border-input bg-background flex min-h-[28px] flex-1 flex-wrap items-center gap-1 rounded-md border p-1">
                    {classes.map((cls, index) => (
                        <ClassChip
                            key={`${cls}-${index}`}
                            cls={cls}
                            onRemove={() => removeClass(cls)}
                        />
                    ))}
                    <ClassInput
                        onCommit={(value) => {
                            const next = value.trim();
                            if (!next) return;
                            const newClasses = next.split(/\s+/).filter(Boolean);
                            const uniqueClasses = [...new Set([...classes, ...newClasses])];
                            void commitClassName(uniqueClasses.join(' '));
                        }}
                    />
                </div>
            </div>
        </div>
    );
});

function ClassChip({ cls, onRemove }: { cls: string; onRemove: () => void }) {
    return (
        <span className="bg-foreground-secondary/10 text-foreground-primary text-mini inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5">
            {cls}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${cls}`}
                className="text-foreground-secondary hover:text-foreground-primary leading-none"
            >
                ×
            </button>
        </span>
    );
}

function ClassInput({ onCommit }: { onCommit: (v: string) => void }) {
    const [draft, setDraft] = useState('');
    return (
        <input
            type="text"
            value={draft}
            placeholder="add class..."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                    e.preventDefault();
                    onCommit(draft);
                    setDraft('');
                }
            }}
            className={cn(
                'placeholder:text-muted-foreground text-mini min-w-[80px] flex-1 bg-transparent px-1 outline-none',
            )}
        />
    );
}
