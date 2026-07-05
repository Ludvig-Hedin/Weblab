'use client';

import { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useTranslations } from 'next-intl';

import { useEditorEngine } from '@/components/store/editor';
import {
    ColorField,
    CustomExpander,
    FontField,
    IconToggleField,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SelectField,
    StyleChipPicker,
    TextField,
} from '../controls';
import { FIELD_BASE_CLASSES } from '../controls/constants';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

interface ContentFieldProps {
    value: string;
    editable: boolean;
    onCommit: (value: string) => void;
}

/**
 * Multi-line text-content editor. Element text can legitimately span
 * several lines (the preload bridge round-trips `\n` ⇄ `<br>`), so this is
 * a `<textarea>` rather than the single-line `TextField`. Geometry tracks
 * `FIELD_BASE_CLASSES` minus the fixed 30px height — it grows up to a few
 * rows then scrolls. Commits on blur or ⌘/Ctrl+Enter; Escape reverts.
 *
 * When `editable` is false (no oid, or the element has element children so
 * its content isn't plain text) the field is shown read-only — the row is
 * still present per the v3 required-selectors list, just not writable here.
 */
function ContentField({ value, editable, onCommit }: ContentFieldProps) {
    const [draft, setDraft] = useState(value);
    const lastValueRef = useRef(value);
    const ref = useRef<HTMLTextAreaElement | null>(null);
    const skipBlurCommitRef = useRef(false);

    useEffect(() => {
        if (value === lastValueRef.current) return;
        lastValueRef.current = value;
        if (document.activeElement !== ref.current) setDraft(value);
    }, [value]);

    const tText = useTranslations('editor.stylePanel.text');
    return (
        <textarea
            ref={ref}
            value={draft}
            rows={2}
            readOnly={!editable}
            aria-label={tText('contentAriaLabel')}
            placeholder={editable ? tText('contentEditablePlaceholder') : tText('contentReadonlyPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false;
                    return;
                }
                if (editable && draft !== value) onCommit(draft);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (editable && draft !== value) onCommit(draft);
                    skipBlurCommitRef.current = true;
                    e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(value);
                    skipBlurCommitRef.current = true;
                    e.currentTarget.blur();
                }
            }}
            className={cn(
                FIELD_BASE_CLASSES,
                'h-auto max-h-24 min-h-[30px] resize-none py-[6px] leading-snug',
                !editable && 'text-foreground-tertiary cursor-default',
            )}
        />
    );
}

const TEXT_ALIGN_ICONS = [
    { value: 'left', label: 'Left', icon: <AlignLeft className="size-3" /> },
    {
        value: 'center',
        label: 'Center',
        icon: <AlignCenter className="size-3" />,
    },
    { value: 'right', label: 'Right', icon: <AlignRight className="size-3" /> },
    {
        value: 'justify',
        label: 'Justify',
        icon: <AlignJustify className="size-3" />,
    },
] as const;

const FONT_WEIGHT_OPTIONS = [
    { value: '100', label: '100 — Thin' },
    { value: '200', label: '200 — Extra light' },
    { value: '300', label: '300 — Light' },
    { value: '400', label: '400 — Normal' },
    { value: '500', label: '500 — Medium' },
    { value: '600', label: '600 — Semi-bold' },
    { value: '700', label: '700 — Bold' },
    { value: '800', label: '800 — Extra bold' },
    { value: '900', label: '900 — Black' },
];

const TEXT_TRANSFORM_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'uppercase', label: 'Uppercase' },
    { value: 'lowercase', label: 'Lowercase' },
    { value: 'capitalize', label: 'Capitalize' },
];

const TEXT_DECORATION_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'underline', label: 'Underline' },
    { value: 'line-through', label: 'Strikethrough' },
];

/**
 * Text — Style chip + Content + Color + Align surface up top per the Figma;
 * everything else (font-family, weight, size, line-height, letter-spacing,
 * transform, decoration, font-style) lands in the Custom expander. The Style
 * chip pulls from the project's saved Text Styles (left-panel Brand tab); the
 * underlying tokens infrastructure is reused unchanged. Content edits the
 * element's plain-text body via the live frame view + an `edit-text` history
 * action (same write path `TextEditingManager` uses for canvas edits).
 */
export const TextSection = observer(function TextSection() {
    const t = useTranslations('editor.stylePanel');
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const selected = editorEngine.elements.selected[0];

    // Element text content. Read async via `getActionElement` (same bridge
    // call the v2 element-header uses); written back through the live frame
    // view + an `edit-text` history action so the source file is updated and
    // the change is undoable — the same path `TextEditingManager` commits on.
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

    const textContent = actionElement?.textContent ?? '';
    // Content is editable only for plain-text elements (no element children).
    // Mixed-content nodes must be edited in code or via AI — mirror the
    // `startEditingText` "plain text only" rule rather than silently mangling.
    const contentEditable =
        !!selected?.oid && !!actionElement && actionElement.children.length === 0;

    const commitContent = async (next: string) => {
        if (!selected?.oid || !actionElement) return;
        const trimmed = next;
        if (trimmed === textContent) return;
        const frameData = editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) return;
        // Capture the target element identity before the await. If the user
        // changes selection mid-await, the optimistic `setActionElement` would
        // otherwise graft this commit's text onto the NEW element's state.
        const targetOid = selected.oid;
        const targetDomId = selected.domId;
        // Wrapped: this runs via `void commitContent(...)` from the textarea's
        // blur/⌘-Enter handlers, so a throw from `editText` / `history.push`
        // would otherwise surface as an unhandled rejection. Mirrors the
        // try/catch the v2 `TextEditingManager` wraps every text write in.
        try {
            const res = await frameData.view.editText(selected.domId, trimmed);
            if (!res) return;
            const pushed = await editorEngine.history.push({
                type: 'edit-text',
                targets: [
                    {
                        frameId: selected.frameId,
                        branchId: selected.branchId,
                        domId: selected.domId,
                        oid: selected.oid,
                    },
                ],
                originalContent: textContent,
                newContent: trimmed,
            });
            if (!pushed) {
                // Source write failed — revert the optimistic iframe edit and
                // leave the panel baseline unchanged so the user can retry the
                // same text (the `trimmed === textContent` guard above would
                // otherwise block a re-commit). Mirrors v4.
                try {
                    await frameData.view.editText(targetDomId, textContent);
                } catch (revertError) {
                    console.error('Error reverting failed text edit:', revertError);
                }
                return;
            }
            // Skip the optimistic patch if selection moved on during the await
            // — the effect reloads fresh data for the new selection anyway.
            const current = editorEngine.elements.selected[0];
            if (current?.oid === targetOid && current?.domId === targetDomId) {
                setActionElement((prev) => (prev ? { ...prev, textContent: trimmed } : prev));
            }
            await editorEngine.overlay.refresh();
        } catch (error) {
            console.error('Error committing text content:', error);
        }
    };

    const color = useStyleValue('color');
    const align = useStyleValue('text-align');
    const fontFamily = useStyleValue('font-family');
    const fontWeight = useStyleValue('font-weight');
    const fontSize = useStyleValue('font-size');
    const lineHeight = useStyleValue('line-height');
    const letterSpacing = useStyleValue('letter-spacing');
    const textTransform = useStyleValue('text-transform');
    const textDecoration = useStyleValue('text-decoration-line');
    const advancedProps = [
        fontFamily,
        fontWeight,
        fontSize,
        lineHeight,
        letterSpacing,
        textTransform,
        textDecoration,
    ];
    const advancedSetCount = advancedProps.filter((v) => v.isSet).length;

    const className = selected?.className ?? '';
    const activeStyle = tokens.detectTextStyleInClassName(className);
    const candidates = tokens.applicableTokensFor('font-family');
    const styleOptions = candidates.textStyles.map((ts) => ({
        name: ts.name,
        label: ts.displayName,
        preview: ts.resolved.fontSize ?? undefined,
    }));

    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);
    const setCount =
        (color.isSet ? 1 : 0) + (align.isSet ? 1 : 0) + (activeStyle ? 1 : 0) + advancedSetCount;

    return (
        <Section id="text" title={t('section.text')} setCount={setCount}>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label={t('text.style')} isSet={!!activeStyle} title={t('text.applyTextStyle')} />
                <StyleChipPicker
                    value={activeStyle?.name ?? ''}
                    options={styleOptions}
                    kind={t('text.textStyleKind')}
                    onApply={(name) => void tokens.applyTextStyleToSelected(name)}
                    onDetach={() => void tokens.applyTextStyleToSelected(null)}
                    onToggleCustom={() => setCustomOpen((v) => !v)}
                    customOpen={customOpen}
                    onCreate={() => {
                        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
                        editorEngine.state.setBrandTab(BrandTabValue.TEXT_STYLES);
                    }}
                />
            </div>
            <div className="flex items-start gap-3 px-3 py-1">
                <PropertyLabel
                    label={t('text.content')}
                    isSet={!!textContent}
                    title={t('text.contentAriaLabel')}
                    className="pt-1.5"
                />
                {/* While the async `getActionElement` read is in flight, the
                    Content field is non-editable and muted: the user can't type
                    into a field that's about to be overwritten, and the
                    blank-then-pop flash is replaced by a calm disabled look. */}
                <div
                    className={cn(
                        'min-w-0 flex-1',
                        isLoading && 'pointer-events-none opacity-50 select-none',
                    )}
                    aria-busy={isLoading}
                >
                    <ContentField
                        value={textContent}
                        editable={contentEditable && !isLoading}
                        onCommit={(next) => void commitContent(next)}
                    />
                </div>
            </div>
            <PropertyControl property="color" label={t('text.color')}>
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="text-align" label={t('text.align')}>
                {({ value, isSet, commit }) => (
                    <IconToggleField
                        value={value}
                        isSet={isSet}
                        options={TEXT_ALIGN_ICONS}
                        onCommit={commit}
                        ariaLabel={t('text.align')}
                    />
                )}
            </PropertyControl>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="font-family" label={t('text.font')}>
                    {({ value, commit }) => <FontField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="font-weight" label={t('text.weight')}>
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={FONT_WEIGHT_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="font-size" label={t('text.size')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="line-height" label={t('text.line')}>
                    {({ value, commit }) => (
                        <NumberField
                            value={value}
                            onCommit={commit}
                            defaultUnit=""
                            units={['', 'px', 'rem', 'em', '%']}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="letter-spacing" label={t('text.letter')}>
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="text-transform" label={t('text.case')}>
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={TEXT_TRANSFORM_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="text-decoration-line" label={t('text.decorShort')}>
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={TEXT_DECORATION_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="text-shadow" label={t('text.shadow')}>
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="0 1px 2px rgba(0,0,0,0.2)"
                        />
                    )}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
