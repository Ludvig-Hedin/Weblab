'use client';

import { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { cn } from '@weblab/ui/utils';

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
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const selected = editorEngine.elements.selected[0];

    // Element text content. Read async via `getActionElement` (same bridge
    // call the v2 element-header uses); written back through the live frame
    // view + an `edit-text` history action so the source file is updated and
    // the change is undoable — the same path `TextEditingManager` commits on.
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
        const res = await frameData.view.editText(selected.domId, trimmed);
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
            newContent: trimmed,
        });
        setActionElement((current) => (current ? { ...current, textContent: trimmed } : current));
        await editorEngine.overlay.refresh();
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
        <Section id="text" title="Text" setCount={setCount}>
            <div className="group/control flex items-center gap-3 px-3 py-1">
                <PropertyLabel label="Style" isSet={!!activeStyle} title="Apply text style" />
                <StyleChipPicker
                    value={activeStyle?.name ?? ''}
                    options={styleOptions}
                    kind="Text Style"
                    onApply={(name) => void tokens.applyTextStyleToSelected(name)}
                    onDetach={() => void tokens.applyTextStyleToSelected(null)}
                    onToggleCustom={() => setCustomOpen((v) => !v)}
                    customOpen={customOpen}
                />
            </div>
            <div className="flex items-start gap-3 px-3 py-1">
                <PropertyLabel
                    label="Content"
                    isSet={!!textContent}
                    title="Element text content"
                    className="pt-1.5"
                />
                <div className="min-w-0 flex-1">
                    <ContentField
                        value={textContent}
                        editable={contentEditable}
                        onCommit={(next) => void commitContent(next)}
                    />
                </div>
            </div>
            <PropertyControl property="color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="text-align" label="Align">
                {({ value, isSet, commit }) => (
                    <IconToggleField
                        value={value}
                        isSet={isSet}
                        options={TEXT_ALIGN_ICONS}
                        onCommit={commit}
                        ariaLabel="Text alignment"
                    />
                )}
            </PropertyControl>
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="font-family" label="Font">
                    {({ value, commit }) => <FontField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="font-weight" label="Weight">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={FONT_WEIGHT_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="font-size" label="Size">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="line-height" label="Line">
                    {({ value, commit }) => (
                        <NumberField
                            value={value}
                            onCommit={commit}
                            defaultUnit=""
                            units={['', 'px', 'rem', 'em', '%']}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="letter-spacing" label="Letter">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="text-transform" label="Case">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={TEXT_TRANSFORM_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="text-decoration-line" label="Decor.">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={TEXT_DECORATION_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="text-shadow" label="Shadow">
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
