'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import {
    ColorPickerInline,
    ColorRow,
    FontField,
    FontHeroRow,
    GroupShell,
    IconAlignCenter,
    IconAlignJustify,
    IconAlignLeft,
    IconAlignRight,
    IconLetterSpacing,
    IconLineHeight,
    IconNumberInput,
    IconSegment,
    IconTypeT,
    LabeledSelectInput,
    LabeledTextInput,
    PairRow,
    StyleChipPicker,
} from '../controls';
import { FIELD_BASE_CLASSES } from '../controls/constants';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

// ── Data ─────────────────────────────────────────────────────────────────────

const TEXT_ALIGN_OPTIONS = [
    { value: 'left', label: 'Left', icon: <IconAlignLeft size={13} /> },
    { value: 'center', label: 'Center', icon: <IconAlignCenter size={13} /> },
    { value: 'right', label: 'Right', icon: <IconAlignRight size={13} /> },
    { value: 'justify', label: 'Justify', icon: <IconAlignJustify size={13} /> },
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
] as const;

const TEXT_TRANSFORM_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'uppercase', label: 'Uppercase' },
    { value: 'lowercase', label: 'Lowercase' },
    { value: 'capitalize', label: 'Capitalize' },
] as const;

const TEXT_DECORATION_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'underline', label: 'Underline' },
    { value: 'line-through', label: 'Strikethrough' },
    { value: 'overline', label: 'Overline' },
] as const;

// ── ContentField ─────────────────────────────────────────────────────────────

interface ContentFieldProps {
    value: string;
    editable: boolean;
    onCommit: (value: string) => void;
}

/**
 * Multi-line text-content editor. Element text can legitimately span several
 * lines (the preload bridge round-trips `\n` ⇄ `<br>`), so this is a
 * `<textarea>` rather than the single-line TextField. Commits on blur or
 * ⌘/Ctrl+Enter; Escape reverts.
 *
 * When `editable` is false (no oid, or the element has element children) the
 * field is shown read-only — the row is still present, just not writable.
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

    return (
        <textarea
            ref={ref}
            value={draft}
            rows={2}
            readOnly={!editable}
            aria-label="Element text content"
            placeholder={editable ? 'Element text…' : 'No editable text'}
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
                'h-auto max-h-24 min-h-[56px] resize-none py-[6px] leading-snug',
                !editable && 'text-foreground-tertiary cursor-default',
            )}
        />
    );
}

// ── TextSection ───────────────────────────────────────────────────────────────

/**
 * Text section — v4 layout.
 *
 * Groups (top to bottom):
 *   1. Style     — StyleChipPicker for named text-style tokens
 *   2. Content   — ContentField textarea (plain-text only)
 *   3. Color     — ColorRow wired to `color`
 *   4. Font      — FontHeroRow + FontField popover + Weight/Size + Line/Letter
 *   5. Alignment — IconSegment 4-button (text-align)
 *   6. Case & Decoration — LabeledSelectInput pair (text-transform + text-decoration-line)
 */
export const TextSection = observer(function TextSection() {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const selected = editorEngine.elements.selected[0];

    // ── Text content (async read) ────────────────────────────────────────────
    const [actionElement, setActionElement] = useState<ActionElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Reading `.view` inside an `observer` subscribes to the FramesManager
    // observable map — when `registerView` fires this flips from null to live
    // and the effect below re-runs.
    const frameView = selected ? editorEngine.frames.get(selected.frameId)?.view : null;

    useEffect(() => {
        let cancelled = false;
        if (!selected) {
            setActionElement(null);
            setIsLoading(false);
            return;
        }
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
    const contentEditable =
        !!selected?.oid && !!actionElement && actionElement.children.length === 0;

    const commitContent = async (next: string) => {
        if (!selected?.oid || !actionElement) return;
        if (next === textContent) return;
        const frameData = editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) return;
        const targetOid = selected.oid;
        const targetDomId = selected.domId;
        try {
            const res = await frameData.view.editText(selected.domId, next);
            if (!res) return;
            await editorEngine.history.push({
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
                newContent: next,
            });
            const current = editorEngine.elements.selected[0];
            if (current?.oid === targetOid && current?.domId === targetDomId) {
                setActionElement((prev) => (prev ? { ...prev, textContent: next } : prev));
            }
            await editorEngine.overlay.refresh();
        } catch (error) {
            console.error('Error committing text content:', error);
        }
    };

    // ── Style values ─────────────────────────────────────────────────────────
    const color = useStyleValue('color');
    const align = useStyleValue('text-align');
    const fontFamily = useStyleValue('font-family');
    const fontWeight = useStyleValue('font-weight');
    const fontSize = useStyleValue('font-size');
    const lineHeight = useStyleValue('line-height');
    const letterSpacing = useStyleValue('letter-spacing');
    const textTransform = useStyleValue('text-transform');
    const textDecoration = useStyleValue('text-decoration-line');
    const textShadow = useStyleValue('text-shadow');

    // Style setters
    const colorSetter = useStyleSetter('color');
    const alignSetter = useStyleSetter('text-align');
    const fontFamilySetter = useStyleSetter('font-family');
    const fontWeightSetter = useStyleSetter('font-weight');
    const fontSizeSetter = useStyleSetter('font-size');
    const lineHeightSetter = useStyleSetter('line-height');
    const letterSpacingSetter = useStyleSetter('letter-spacing');
    const textTransformSetter = useStyleSetter('text-transform');
    const textDecorationSetter = useStyleSetter('text-decoration-line');
    const textShadowSetter = useStyleSetter('text-shadow');

    // ── Text-style tokens (Style group) ──────────────────────────────────────
    const className = selected?.className ?? '';
    const activeStyle = tokens.detectTextStyleInClassName(className);
    const candidates = tokens.applicableTokensFor('font-family');
    const styleOptions = candidates.textStyles.map((ts) => ({
        name: ts.name,
        label: ts.displayName,
        preview: ts.resolved.fontSize ?? undefined,
    }));

    // ── Custom-expander state (Style group toggle) ────────────────────────────
    const advancedSetCount = [
        fontFamily,
        fontWeight,
        fontSize,
        lineHeight,
        letterSpacing,
        textTransform,
        textDecoration,
    ].filter((v) => v.isSet).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    // setCount removed in v4 — section dot hidden per design brief.

    // Weight — parse numeric portion for sample rendering
    const weightNum = parseInt(fontWeight.value, 10);
    const sampleWeight = Number.isNaN(weightNum) ? 400 : weightNum;

    return (
        <Section id="text" title="Text">
            <div className="flex flex-col gap-3 px-3 pb-3">
                {/* ── 1. Style ─────────────────────────────────────────── */}
                <GroupShell label="Style">
                    <div className="group/control flex items-center">
                        <StyleChipPicker
                            value={activeStyle?.name ?? ''}
                            options={styleOptions}
                            kind="Text Style"
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
                </GroupShell>

                {/* ── 2. Content ───────────────────────────────────────── */}
                <GroupShell label="Content">
                    <div
                        className={cn(
                            'min-w-0',
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
                </GroupShell>

                {/* ── 3. Color ─────────────────────────────────────────── */}
                <GroupShell label="Color">
                    <ColorRow
                        value={color.value}
                        onCommit={colorSetter.set}
                        pickerContent={
                            <ColorPickerInline value={color.value} onCommit={colorSetter.set} />
                        }
                        mixed={color.mixed}
                    />
                </GroupShell>

                {/* ── 4. Font ──────────────────────────────────────────── */}
                <GroupShell label="Font">
                    {/* Hero row IS the picker trigger — one click opens the
                        searchable font popover anchored to the row. */}
                    <FontField
                        value={fontFamily.value}
                        onCommit={fontFamilySetter.set}
                        trigger={
                            <FontHeroRow family={fontFamily.value} sampleWeight={sampleWeight} />
                        }
                    />

                    {/* Pair 1: Weight + Size */}
                    <PairRow>
                        <LabeledSelectInput
                            label="Weight"
                            value={fontWeight.value}
                            options={FONT_WEIGHT_OPTIONS}
                            onCommit={fontWeightSetter.set}
                            mixed={fontWeight.mixed}
                        />
                        <IconNumberInput
                            glyph={<IconTypeT size={13} />}
                            value={fontSize.value}
                            onCommit={fontSizeSetter.set}
                            units={['px', 'rem', 'em']}
                            defaultUnit="px"
                            aria-label="Font size"
                            mixed={fontSize.mixed}
                        />
                    </PairRow>

                    {/* Pair 2: Line-height + Letter-spacing */}
                    <PairRow>
                        <IconNumberInput
                            glyph={<IconLineHeight size={13} />}
                            value={lineHeight.value}
                            onCommit={lineHeightSetter.set}
                            units={['', 'px', 'rem', 'em', '%']}
                            defaultUnit=""
                            aria-label="Line height"
                            mixed={lineHeight.mixed}
                        />
                        <IconNumberInput
                            glyph={<IconLetterSpacing size={13} />}
                            value={letterSpacing.value}
                            onCommit={letterSpacingSetter.set}
                            units={['em', 'rem', 'px']}
                            defaultUnit="em"
                            aria-label="Letter spacing"
                            mixed={letterSpacing.mixed}
                        />
                    </PairRow>
                </GroupShell>

                {/* ── 5. Alignment ─────────────────────────────────────── */}
                <GroupShell label="Alignment">
                    <IconSegment
                        // Browsers compute the `text-align` default as the
                        // logical `start`/`end` — map to the physical values
                        // the segment options use so the current alignment
                        // always lights up (LTR assumption matches the rest
                        // of the editor).
                        value={
                            align.value === 'start'
                                ? 'left'
                                : align.value === 'end'
                                  ? 'right'
                                  : align.value
                        }
                        options={TEXT_ALIGN_OPTIONS}
                        onCommit={alignSetter.set}
                        ariaLabel="Text alignment"
                    />
                </GroupShell>

                {/* ── 6. Case & Decoration ─────────────────────────────── */}
                <GroupShell label="Case & Decoration">
                    <PairRow>
                        <LabeledSelectInput
                            label="Case"
                            value={textTransform.value}
                            options={TEXT_TRANSFORM_OPTIONS}
                            onCommit={textTransformSetter.set}
                            mixed={textTransform.mixed}
                        />
                        <LabeledSelectInput
                            label="Decor"
                            value={textDecoration.value}
                            options={TEXT_DECORATION_OPTIONS}
                            onCommit={textDecorationSetter.set}
                            mixed={textDecoration.mixed}
                        />
                    </PairRow>
                </GroupShell>

                {/* ── 7. Text shadow ───────────────────────────────────── */}
                <GroupShell label="Text shadow">
                    <LabeledTextInput
                        value={textShadow.value}
                        onCommit={textShadowSetter.set}
                        placeholder="0 1px 2px rgba(0,0,0,0.2)"
                        aria-label="Text shadow"
                        mixed={textShadow.mixed}
                    />
                </GroupShell>
            </div>
        </Section>
    );
});
