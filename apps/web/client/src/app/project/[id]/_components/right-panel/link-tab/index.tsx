'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { DomElement } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { toast } from '@weblab/ui/sonner';

import type { LinkTargetState } from './use-link-target';
import type {
    BuildHrefResult,
    LinkProblem,
    LinkSourceInfo,
    LinkType,
} from '@/components/store/editor/link/analyze';
import { useEditorEngine } from '@/components/store/editor';
import {
    analyzeLinkSource,
    buildHref,
    classifyHref,
    hrefToFieldValue,
    isSafeLabel,
    LINK_TYPES,
} from '@/components/store/editor/link/analyze';
import { GroupShell, OpenInNewTabCheckbox, SelectField, TextField } from '../style-tab-v4/controls';

type SourceState =
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'ready'; info: LinkSourceInfo };

/** `{ __remove: true }` tells the source writer to delete the attribute. */
const REMOVE_ATTR = { __remove: true } as const;
const NEW_TAB_REL = 'noopener noreferrer';

function Note({ children }: { children: React.ReactNode }) {
    return <p className="text-foreground-tertiary text-mini leading-snug">{children}</p>;
}

/** Walks up from `domId` to see if it sits inside a `<form>`. */
async function isInsideForm(
    element: DomElement,
    getParent: (domId: string) => Promise<DomElement | null>,
) {
    let current: DomElement | null = element;
    for (let depth = 0; depth < 20 && current; depth++) {
        current = await getParent(current.domId).catch(() => null);
        if (!current || current.tagName === 'body') return false;
        if (current.tagName === 'form') return true;
    }
    return false;
}

export const LinkTab = observer(function LinkTab({ target }: { target: LinkTargetState }) {
    const t = useTranslations('editor.panels.edit.tabs.link');

    if (target.status === 'loading') {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center">
                <Note>{t('loading')}</Note>
            </div>
        );
    }
    if (target.status === 'none') {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="text-foreground-primary text-small font-medium">{t('selectHint')}</p>
            </div>
        );
    }
    return (
        <LinkEditor
            key={`${target.element.frameId}:${target.element.domId}`}
            element={target.element}
        />
    );
});

const LinkEditor = observer(function LinkEditor({ element }: { element: DomElement }) {
    const t = useTranslations('editor.panels.edit.tabs.link');
    const editorEngine = useEditorEngine();
    const [source, setSource] = useState<SourceState>({ status: 'loading' });
    const [reloadKey, setReloadKey] = useState(0);
    const [insideForm, setInsideForm] = useState<boolean | null>(null);
    const frameView = editorEngine.frames.get(element.frameId)?.view ?? null;

    // Read the element's JSX so we only offer edits the source can take.
    useEffect(() => {
        let cancelled = false;
        const oid = element.oid;
        const codeEditor = editorEngine.branches.getBranchDataById(element.branchId)?.codeEditor;
        if (!oid || !codeEditor) {
            setSource({ status: 'missing' });
            return;
        }
        void (async () => {
            try {
                const metadata = await codeEditor.getJsxElementMetadata(oid);
                const info = metadata?.code ? analyzeLinkSource(metadata.code) : null;
                if (!cancelled) setSource(info ? { status: 'ready', info } : { status: 'missing' });
            } catch {
                if (!cancelled) setSource({ status: 'missing' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editorEngine.branches, element.branchId, element.oid, reloadKey]);

    // A button inside a form may submit it, so it must not become a link.
    useEffect(() => {
        if (element.tagName !== 'button' || !frameView) return;
        let cancelled = false;
        void isInsideForm(element, (domId) => frameView.getParentElement(domId)).then((inside) => {
            if (!cancelled) setInsideForm(inside);
        });
        return () => {
            cancelled = true;
        };
    }, [element, frameView]);

    const writeAttributes = useCallback(
        async (attributes: Record<string, unknown>, tagName: string | null = null) => {
            if (!element.oid) return false;
            try {
                await editorEngine.code.writeRequest([
                    {
                        oid: element.oid,
                        branchId: element.branchId,
                        attributes,
                        tagName,
                        textContent: null,
                        overrideClasses: null,
                        structureChanges: [],
                    },
                ]);
                return true;
            } catch (error) {
                console.error('Failed to update link:', error);
                toast.error(t('saveFailed'));
                return false;
            } finally {
                setReloadKey((k) => k + 1);
            }
        },
        [editorEngine.code, element.branchId, element.oid, t],
    );

    const commitHref = useCallback((href: string) => writeAttributes({ href }), [writeAttributes]);

    const commitNewTab = useCallback(
        (checked: boolean) =>
            writeAttributes(
                checked
                    ? { target: '_blank', rel: NEW_TAB_REL }
                    : { target: REMOVE_ATTR, rel: REMOVE_ATTR },
            ),
        [writeAttributes],
    );

    const convertToLink = useCallback(
        () => writeAttributes({ href: '/', type: REMOVE_ATTR }, 'a'),
        [writeAttributes],
    );

    const commitLabel = useCallback(
        async (original: string, next: string) => {
            const text = next.trim();
            if (!text || text === original) return;
            if (!isSafeLabel(text)) {
                toast.error(t('textBadCharacters'));
                return;
            }
            // Same history + source path as inline text editing; a failed
            // save is already reported by the history manager.
            await editorEngine.action.run({
                type: 'edit-text',
                targets: [
                    {
                        frameId: element.frameId,
                        branchId: element.branchId,
                        domId: element.domId,
                        oid: element.oid,
                    },
                ],
                originalContent: original,
                newContent: text,
            });
            setReloadKey((k) => k + 1);
        },
        [editorEngine.action, element, t],
    );

    if (source.status === 'loading') {
        return (
            <div className="px-3 py-3">
                <Note>{t('loading')}</Note>
            </div>
        );
    }

    if (source.status === 'missing') {
        return (
            <div className="px-3 py-3">
                <Note>{t('notes.notInCode')}</Note>
            </div>
        );
    }

    const { info } = source;
    const isButton = element.tagName === 'button';

    let linkBody: React.ReactNode;
    if (
        info.href.state === 'dynamic' ||
        (info.href.state === 'missing' && (info.hasSpread || (!isButton && info.tag !== 'a')))
    ) {
        linkBody = <Note>{t('notes.hrefFromCode')}</Note>;
    } else if (info.href.state === 'missing' && isButton) {
        const canConvert = isButton && info.canConvertToLink && insideForm === false;
        linkBody = (
            <div className="flex flex-col gap-2">
                <Note>
                    {t('notes.buttonNotLink')}{' '}
                    {canConvert ? t('notes.canConvert') : t('notes.cannotConvert')}
                </Note>
                {canConvert && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() => void convertToLink()}
                    >
                        {t('makeLink')}
                    </Button>
                )}
            </div>
        );
    } else {
        const href = info.href.state === 'literal' ? info.href.value : '';
        linkBody = (
            <HrefEditor
                href={href}
                frameId={element.frameId}
                target={info.target}
                onCommitHref={commitHref}
                onCommitNewTab={commitNewTab}
            />
        );
    }

    return (
        <ScrollArea className="h-full w-full">
            <div className="flex flex-col gap-4 px-3 py-3">
                {linkBody}
                <GroupShell label={t('text')}>
                    {info.label !== null ? (
                        <TextField
                            value={info.label}
                            placeholder={t('textPlaceholder')}
                            onCommit={(next) => void commitLabel(info.label ?? '', next)}
                        />
                    ) : (
                        <Note>{t('textNotEditable')}</Note>
                    )}
                </GroupShell>
            </div>
        </ScrollArea>
    );
});

interface HrefEditorProps {
    href: string;
    frameId: string;
    target: LinkSourceInfo['target'];
    onCommitHref: (href: string) => Promise<boolean>;
    onCommitNewTab: (checked: boolean) => Promise<boolean>;
}

const HrefEditor = observer(function HrefEditor({
    href,
    frameId,
    target,
    onCommitHref,
    onCommitNewTab,
}: HrefEditorProps) {
    const t = useTranslations('editor.panels.edit.tabs.link');
    const editorEngine = useEditorEngine();
    const [type, setType] = useState<LinkType>(() => (href ? classifyHref(href) : 'page'));
    const [problem, setProblem] = useState<LinkProblem | null>(null);

    // Follow outside changes (undo, reload) to the saved href.
    useEffect(() => {
        if (href) setType(classifyHref(href));
        setProblem(null);
    }, [href]);

    const savedValue = href && classifyHref(href) === type ? hrefToFieldValue(type, href) : '';

    const pageOptions = useMemo(() => {
        const options = (editorEngine.pages?.flatPages ?? []).map((page) => ({
            value: page.path,
            label: page.path === '/' ? t('home') : page.name || page.slug || page.path,
        }));
        if (type === 'page' && savedValue && !options.some((o) => o.value === savedValue)) {
            options.unshift({ value: savedValue, label: savedValue });
        }
        return options;
    }, [editorEngine.pages?.flatPages, savedValue, t, type]);

    // Read during render (not memoized) so the observer follows layer-map updates.
    const sectionIds = new Set<string>();
    for (const node of editorEngine.ast.mappings.getMapping(frameId)?.values() ?? []) {
        if (node.htmlId) sectionIds.add(node.htmlId);
    }
    if (type === 'section' && savedValue) sectionIds.add(savedValue);
    const sectionOptions = Array.from(sectionIds)
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ value: id, label: `#${id}` }));

    const commit = (raw: string) => {
        const result: BuildHrefResult = buildHref(type, raw);
        if (!result.ok) {
            setProblem(result.problem);
            return;
        }
        setProblem(null);
        if (result.href !== href) void onCommitHref(result.href);
    };

    const typeOptions = LINK_TYPES.map((value) => ({
        value,
        label: t(`types.${value}`),
    }));
    const newTabChecked = target.state === 'literal' && target.value === '_blank';

    let field: React.ReactNode;
    switch (type) {
        case 'page':
            field =
                pageOptions.length > 0 ? (
                    <SelectField
                        value={savedValue}
                        options={pageOptions}
                        placeholder={t('choosePage')}
                        onCommit={commit}
                    />
                ) : (
                    <Note>{t('noPages')}</Note>
                );
            break;
        case 'section':
            field =
                sectionOptions.length > 0 ? (
                    <SelectField
                        value={savedValue}
                        options={sectionOptions}
                        placeholder={t('chooseSection')}
                        onCommit={commit}
                    />
                ) : (
                    <Note>{t('noSections')}</Note>
                );
            break;
        default:
            field = (
                <TextField
                    key={type}
                    value={savedValue}
                    placeholder={t(`placeholders.${type}`)}
                    onCommit={commit}
                />
            );
    }

    return (
        <div className="flex flex-col gap-3">
            <GroupShell label={t('goesTo')}>
                <SelectField
                    value={type}
                    options={typeOptions}
                    onCommit={(next) => {
                        setType(next as LinkType);
                        setProblem(null);
                    }}
                />
            </GroupShell>
            <GroupShell label={t(`fields.${type}`)}>
                {field}
                {problem && (
                    <p className="text-destructive text-mini">{t(`problems.${problem}`)}</p>
                )}
            </GroupShell>
            {href &&
                (target.state === 'dynamic' ? (
                    <Note>{t('notes.targetFromCode')}</Note>
                ) : (
                    <OpenInNewTabCheckbox
                        checked={newTabChecked}
                        label={t('openInNewTab')}
                        onChange={(checked) => void onCommitNewTab(checked)}
                    />
                ))}
        </div>
    );
});
