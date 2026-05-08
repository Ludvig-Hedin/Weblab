'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { ActionElement } from '@weblab/models/actions';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Slider } from '@weblab/ui/slider';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';
import {
    getAutolayoutStyles,
    LayoutMode,
    LayoutProperty,
    parseModeAndValue,
} from '@weblab/utility';

import type { TextAlign } from '../../editor-bar/hooks/use-text-control';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { useTextControl } from '../../editor-bar/hooks/use-text-control';
import { InputColor } from '../../editor-bar/inputs/input-color';
import { PositionSection } from './position-section';

const TEXT_TAGS = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'a',
    'strong',
    'b',
    'em',
    'i',
    'mark',
    'code',
    'small',
    'blockquote',
    'pre',
    'time',
    'sub',
    'sup',
    'del',
    'ins',
    'u',
    'abbr',
    'cite',
    'q',
]);

const DISPLAY_OPTIONS = ['block', 'flex', 'grid', 'none'];
const FLEX_DIRECTION_OPTIONS = ['row', 'column', 'row-reverse', 'column-reverse'];
const ALIGN_OPTIONS = [
    'flex-start',
    'center',
    'flex-end',
    'space-between',
    'space-around',
    'space-evenly',
    'stretch',
];
const ALIGN_ITEMS_OPTIONS = ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'];
const OVERFLOW_OPTIONS = ['visible', 'hidden', 'scroll', 'auto'];
const BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted', 'double'];
const TEXT_TRANSFORM_OPTIONS = ['none', 'uppercase', 'capitalize', 'lowercase'];
const TEXT_DECORATION_OPTIONS = ['none', 'underline', 'line-through', 'overline'];
const TEXT_ALIGN_OPTIONS: TextAlign[] = ['left', 'center', 'right', 'justify'];

const DIMENSION_FIELD_GROUPS = [
    { key: 'width', label: 'W' },
    { key: 'height', label: 'H' },
    { key: 'minWidth', label: 'Min W' },
    { key: 'maxWidth', label: 'Max W' },
    { key: 'minHeight', label: 'Min H' },
    { key: 'maxHeight', label: 'Max H' },
] as const;

const EDGE_FIELDS = [
    { key: 'Top', label: 'Top' },
    { key: 'Right', label: 'Right' },
    { key: 'Bottom', label: 'Bottom' },
    { key: 'Left', label: 'Left' },
] as const;

const Section = ({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) => (
    <section className="border-border/50 border-b pb-4 last:border-b-0 last:pb-0">
        <div className="mb-3">
            <h3 className="text-foreground text-small font-medium">{title}</h3>
            {description && (
                <p className="text-foreground-tertiary text-mini mt-1">{description}</p>
            )}
        </div>
        <div className="space-y-3">{children}</div>
    </section>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-foreground-tertiary text-[11px] tracking-[0.18em] uppercase">
        {children}
    </span>
);

const FieldRow = ({
    label,
    children,
    align = 'center',
}: {
    label: string;
    children: React.ReactNode;
    align?: 'center' | 'start';
}) => (
    <div
        className={cn(
            'flex gap-3',
            align === 'center' ? 'items-center justify-between' : 'items-start justify-between',
        )}
    >
        <FieldLabel>{label}</FieldLabel>
        <div className="min-w-0 flex-1">{children}</div>
    </div>
);

const normalizeLengthValue = (value: string, allowAuto = true) => {
    const trimmed = value.trim();
    if (trimmed === '') {
        return '';
    }
    if (allowAuto && trimmed === 'auto') {
        return trimmed;
    }
    if (/^[-+]?[0-9]*\.?[0-9]+$/.test(trimmed)) {
        return `${trimmed}px`;
    }
    return trimmed;
};

const getDisplayedValue = (value: string) => {
    if (!value || value === '--') {
        return '';
    }
    return value;
};

const DraftInput = ({
    value,
    onCommit,
    placeholder,
    suffix,
    disabled = false,
}: {
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
    suffix?: string;
    disabled?: boolean;
}) => {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const commit = () => onCommit(draft);

    return (
        <div
            className={cn(
                'border-border/60 bg-background-secondary flex h-8 items-center rounded-md border px-2',
                disabled && 'opacity-60',
            )}
        >
            <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        commit();
                    }
                }}
                disabled={disabled}
                placeholder={placeholder}
                className="text-small h-full border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {suffix && <span className="text-foreground-tertiary text-mini ml-2">{suffix}</span>}
        </div>
    );
};

const DraftTextarea = ({
    value,
    onCommit,
    placeholder,
}: {
    value: string;
    onCommit: (value: string) => void;
    placeholder?: string;
}) => {
    const [draft, setDraft] = useState(value);

    useEffect(() => {
        setDraft(value);
    }, [value]);

    const commit = () => onCommit(draft);

    return (
        <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    commit();
                }
            }}
            placeholder={placeholder}
            className="border-border/60 bg-background-secondary text-small min-h-16 resize-none px-2.5 py-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
    );
};

const SelectField = ({
    value,
    options,
    onValueChange,
    placeholder,
}: {
    value: string;
    options: string[];
    onValueChange: (value: string) => void;
    placeholder?: string;
}) => (
    <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="border-border/60 bg-background-secondary text-small h-8 w-full">
            <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
            {options.map((option) => (
                <SelectItem key={option} value={option}>
                    {option}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);

const AlignButtons = ({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: TextAlign) => void;
}) => (
    <div className="border-border/60 bg-background-secondary grid grid-cols-4 gap-1 rounded-lg border p-1">
        {TEXT_ALIGN_OPTIONS.map((option) => (
            <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={cn(
                    'text-mini rounded-md px-2 py-1.5 capitalize transition-colors',
                    value === option
                        ? 'bg-foreground text-background'
                        : 'text-foreground-secondary hover:bg-background-tertiary',
                )}
            >
                {option}
            </button>
        ))}
    </div>
);

const parseOpacityPercent = (value: string) => {
    if (!value) {
        return 100;
    }
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
        return 100;
    }
    return parsed <= 1 ? Math.round(parsed * 100) : Math.round(parsed);
};

export const StyleTab = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const selectedElement = editorEngine.elements.selected[0];
    const selectedStyle = editorEngine.style.selectedStyle;
    const [actionElement, setActionElement] = useState<ActionElement | null>(null);
    const definedStyles = selectedStyle?.styles.defined;
    const computedStyles = selectedStyle?.styles.computed;
    const {
        textState,
        handleFontFamilyChange,
        handleFontSizeChange,
        handleFontWeightChange,
        handleTextAlignChange,
        handleTextColorChange,
        handleLetterSpacingChange,
        handleCapitalizationChange,
        handleTextDecorationChange,
        handleLineHeightChange,
    } = useTextControl();

    useEffect(() => {
        if (!editorEngine.activeSandbox.session.provider) {
            return;
        }
        editorEngine.font.init();
    }, [editorEngine.activeSandbox.session.provider, editorEngine.font]);

    useEffect(() => {
        let cancelled = false;

        const loadActionElement = async () => {
            if (!selectedElement) {
                setActionElement(null);
                return;
            }

            const frameData = editorEngine.frames.get(selectedElement.frameId);
            if (!frameData?.view) {
                setActionElement(null);
                return;
            }

            const nextActionElement = await frameData.view.getActionElement(selectedElement.domId);

            if (!cancelled) {
                setActionElement(nextActionElement);
            }
        };

        void loadActionElement();

        return () => {
            cancelled = true;
        };
    }, [editorEngine.frames, selectedElement]);

    const readStyle = useMemo(
        () =>
            (key: string, fallback = '') =>
                definedStyles?.[key]?.toString() ?? computedStyles?.[key]?.toString() ?? fallback,
        [computedStyles, definedStyles],
    );

    if (!selectedElement || !selectedStyle) {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="space-y-2">
                    <p className="text-foreground text-small font-medium">
                        {t(transKeys.editor.panels.edit.tabs.styles.emptyState)}
                    </p>
                    <p className="text-foreground-tertiary text-mini">
                        {t(transKeys.editor.panels.edit.tabs.styles.emptyStateHint)}
                    </p>
                </div>
            </div>
        );
    }

    const isTextElement = TEXT_TAGS.has(selectedElement.tagName.toLowerCase());
    const displayValue = readStyle('display', 'block');
    const widthValue = readStyle('width');
    const heightValue = readStyle('height');
    const widthMode = parseModeAndValue(widthValue || `${selectedStyle.rect.width}px`).mode;
    const heightMode = parseModeAndValue(heightValue || `${selectedStyle.rect.height}px`).mode;
    const opacityPercent = parseOpacityPercent(readStyle('opacity', '1'));
    const borderWidthValue = readStyle('borderWidth');
    const borderRadiusValue = readStyle('borderRadius');
    const gapValue = readStyle('gap');
    const overflowXValue = readStyle('overflowX', readStyle('overflow', 'visible'));
    const overflowYValue = readStyle('overflowY', readStyle('overflow', 'visible'));
    const fontWeightValue = textState.fontWeight || '400';
    const matchedFont = editorEngine.font.fonts.find(
        (font) => font.id.toLowerCase() === textState.fontFamily.toLowerCase(),
    );

    const commitDimensionMode = (dimension: 'width' | 'height', mode: LayoutMode) => {
        const nextValue = getAutolayoutStyles(
            dimension === 'width' ? LayoutProperty.width : LayoutProperty.height,
            mode,
            readStyle(dimension),
            selectedStyle.rect,
            selectedStyle.parentRect,
        );
        editorEngine.style.update(dimension, nextValue);
    };

    const commitLengthStyle = (key: string, value: string, allowAuto = true) => {
        editorEngine.style.update(key, normalizeLengthValue(value, allowAuto));
    };

    const commitRawStyle = (key: string, value: string) => {
        editorEngine.style.update(key, value.trim());
    };

    const commitClassNames = async (value: string) => {
        if (!selectedElement.oid) {
            toast.error('This element cannot be edited from the styles panel yet.');
            return;
        }

        const className = value.trim();
        await editorEngine.code.updateElementMetadata({
            oid: selectedElement.oid,
            branchId: selectedElement.branchId,
            attributes: { className },
            overrideClasses: true,
        });
        setActionElement((current) =>
            current
                ? {
                      ...current,
                      attributes: {
                          ...current.attributes,
                          className,
                      },
                  }
                : current,
        );
    };

    const commitTagName = async (value: string) => {
        if (!selectedElement.oid) {
            toast.error('This element cannot be retagged from the styles panel yet.');
            return;
        }

        const tagName = value.trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(tagName)) {
            toast.error('Use a valid lowercase HTML tag name.');
            return;
        }

        await editorEngine.code.updateElementMetadata({
            oid: selectedElement.oid,
            branchId: selectedElement.branchId,
            tagName,
        });
        setActionElement((current) => (current ? { ...current, tagName } : current));
    };

    const classNameValue =
        actionElement?.attributes.className ?? actionElement?.attributes.class ?? '';

    return (
        <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-3">
                <section className="border-border/50 border-b pb-4">
                    <div className="space-y-1.5">
                        <FieldLabel>Classes</FieldLabel>
                        <DraftTextarea
                            value={classNameValue}
                            placeholder="flex items-center gap-2"
                            onCommit={(value) => void commitClassNames(value)}
                        />
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <FieldLabel>Tag</FieldLabel>
                        <DraftInput
                            value={actionElement?.tagName ?? selectedElement.tagName}
                            placeholder="div"
                            onCommit={(value) => void commitTagName(value)}
                        />
                    </div>
                    <div className="text-foreground-tertiary text-mini mt-3 truncate">
                        {selectedElement.domId}
                    </div>
                </section>

                <Section
                    title="Layout"
                    description="Display, flex/grid flow, overflow, and element sizing."
                >
                    <FieldRow label="Display">
                        <SelectField
                            value={displayValue}
                            options={DISPLAY_OPTIONS}
                            onValueChange={(value) => editorEngine.style.update('display', value)}
                        />
                    </FieldRow>

                    {displayValue === 'flex' && (
                        <>
                            <FieldRow label="Direction">
                                <SelectField
                                    value={readStyle('flexDirection', 'row')}
                                    options={FLEX_DIRECTION_OPTIONS}
                                    onValueChange={(value) =>
                                        editorEngine.style.update('flexDirection', value)
                                    }
                                />
                            </FieldRow>
                            <FieldRow label="Justify">
                                <SelectField
                                    value={readStyle('justifyContent', 'flex-start')}
                                    options={ALIGN_OPTIONS}
                                    onValueChange={(value) =>
                                        editorEngine.style.update('justifyContent', value)
                                    }
                                />
                            </FieldRow>
                            <FieldRow label="Align">
                                <SelectField
                                    value={readStyle('alignItems', 'stretch')}
                                    options={ALIGN_ITEMS_OPTIONS}
                                    onValueChange={(value) =>
                                        editorEngine.style.update('alignItems', value)
                                    }
                                />
                            </FieldRow>
                        </>
                    )}

                    {displayValue === 'grid' && (
                        <>
                            <FieldRow label="Columns">
                                <DraftInput
                                    value={getDisplayedValue(readStyle('gridTemplateColumns'))}
                                    placeholder="repeat(3, 1fr)"
                                    onCommit={(value) =>
                                        commitRawStyle('gridTemplateColumns', value)
                                    }
                                />
                            </FieldRow>
                            <FieldRow label="Rows">
                                <DraftInput
                                    value={getDisplayedValue(readStyle('gridTemplateRows'))}
                                    placeholder="auto auto"
                                    onCommit={(value) => commitRawStyle('gridTemplateRows', value)}
                                />
                            </FieldRow>
                        </>
                    )}

                    {(displayValue === 'flex' || displayValue === 'grid') && (
                        <FieldRow label="Gap">
                            <DraftInput
                                value={getDisplayedValue(gapValue)}
                                placeholder="16px"
                                onCommit={(value) => commitLengthStyle('gap', value)}
                            />
                        </FieldRow>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <FieldLabel>Width</FieldLabel>
                            <SelectField
                                value={widthMode}
                                options={Object.values(LayoutMode)}
                                onValueChange={(value) =>
                                    commitDimensionMode('width', value as LayoutMode)
                                }
                            />
                            <DraftInput
                                value={getDisplayedValue(widthValue)}
                                placeholder="320px"
                                onCommit={(value) => commitLengthStyle('width', value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>Height</FieldLabel>
                            <SelectField
                                value={heightMode}
                                options={Object.values(LayoutMode)}
                                onValueChange={(value) =>
                                    commitDimensionMode('height', value as LayoutMode)
                                }
                            />
                            <DraftInput
                                value={getDisplayedValue(heightValue)}
                                placeholder="240px"
                                onCommit={(value) => commitLengthStyle('height', value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {DIMENSION_FIELD_GROUPS.filter(
                            ({ key }) => key.startsWith('min') || key.startsWith('max'),
                        ).map(({ key, label }) => (
                            <div key={key} className="space-y-1.5">
                                <FieldLabel>{label}</FieldLabel>
                                <DraftInput
                                    value={getDisplayedValue(readStyle(key))}
                                    placeholder="none"
                                    onCommit={(value) => commitLengthStyle(key, value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                            <FieldLabel>Overflow X</FieldLabel>
                            <SelectField
                                value={overflowXValue}
                                options={OVERFLOW_OPTIONS}
                                onValueChange={(value) =>
                                    editorEngine.style.update('overflowX', value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>Overflow Y</FieldLabel>
                            <SelectField
                                value={overflowYValue}
                                options={OVERFLOW_OPTIONS}
                                onValueChange={(value) =>
                                    editorEngine.style.update('overflowY', value)
                                }
                            />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Spacing"
                    description="Control padding and margin with overall and per-side values."
                >
                    {(['padding', 'margin'] as const).map((group) => (
                        <div key={group} className="space-y-2">
                            <div className="text-foreground-secondary text-mini font-medium capitalize">
                                {group}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <FieldLabel>All</FieldLabel>
                                    <DraftInput
                                        value={getDisplayedValue(readStyle(group))}
                                        placeholder="0px"
                                        onCommit={(value) =>
                                            commitLengthStyle(group, value, group === 'margin')
                                        }
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {EDGE_FIELDS.map(({ key, label }) => {
                                        const property = `${group}${key}`;
                                        return (
                                            <div key={property} className="space-y-1.5">
                                                <FieldLabel>{label}</FieldLabel>
                                                <DraftInput
                                                    value={getDisplayedValue(readStyle(property))}
                                                    placeholder="0px"
                                                    onCommit={(value) =>
                                                        commitLengthStyle(
                                                            property,
                                                            value,
                                                            group === 'margin',
                                                        )
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </Section>

                <Section
                    title="Appearance"
                    description="Visual styling for fills, borders, corners, and transparency."
                >
                    <FieldRow label="Background" align="start">
                        <InputColor
                            color={readStyle('backgroundColor', '#000000')}
                            elementStyleKey="backgroundColor"
                        />
                    </FieldRow>

                    {isTextElement && (
                        <FieldRow label="Text color" align="start">
                            <InputColor
                                color={textState.textColor}
                                elementStyleKey="color"
                                onColorChange={handleTextColorChange}
                            />
                        </FieldRow>
                    )}

                    <FieldRow label="Border color" align="start">
                        <InputColor
                            color={readStyle('borderColor', '#000000')}
                            elementStyleKey="borderColor"
                        />
                    </FieldRow>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1.5">
                            <FieldLabel>Width</FieldLabel>
                            <DraftInput
                                value={getDisplayedValue(borderWidthValue)}
                                placeholder="0px"
                                onCommit={(value) => commitLengthStyle('borderWidth', value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>Style</FieldLabel>
                            <SelectField
                                value={readStyle('borderStyle', 'solid')}
                                options={BORDER_STYLE_OPTIONS}
                                onValueChange={(value) =>
                                    editorEngine.style.update('borderStyle', value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <FieldLabel>Radius</FieldLabel>
                            <DraftInput
                                value={getDisplayedValue(borderRadiusValue)}
                                placeholder="0px"
                                onCommit={(value) => commitLengthStyle('borderRadius', value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <FieldLabel>Opacity</FieldLabel>
                            <span className="text-foreground-secondary text-mini">
                                {opacityPercent}%
                            </span>
                        </div>
                        <Slider
                            value={[opacityPercent]}
                            max={100}
                            step={1}
                            onValueChange={([value]) => {
                                if (typeof value !== 'number') {
                                    return;
                                }
                                editorEngine.style.update('opacity', `${value / 100}`);
                            }}
                        />
                    </div>
                </Section>

                <Section
                    title="Position"
                    description="Positioning mode, offsets, and stacking order."
                >
                    <PositionSection />
                </Section>

                {isTextElement && (
                    <Section
                        title="Typography"
                        description="Fonts, alignment, and detailed text settings."
                    >
                        <FieldRow label="Font">
                            <div className="space-y-2">
                                <Select
                                    value={matchedFont?.id}
                                    onValueChange={(value) => {
                                        const font = editorEngine.font.fonts.find(
                                            (item) => item.id === value,
                                        );
                                        if (font) {
                                            handleFontFamilyChange(font);
                                        }
                                    }}
                                >
                                    <SelectTrigger className="border-border/60 bg-background-secondary text-small h-8 w-full">
                                        <SelectValue
                                            placeholder={textState.fontFamily || 'Choose font'}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {editorEngine.font.fonts.map((font) => (
                                            <SelectItem key={font.id} value={font.id}>
                                                {font.family}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                        editorEngine.state.setBrandTab(BrandTabValue.FONTS);
                                        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
                                    }}
                                >
                                    Manage fonts
                                </Button>
                            </div>
                        </FieldRow>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <FieldLabel>Size</FieldLabel>
                                <DraftInput
                                    value={String(textState.fontSize)}
                                    placeholder="16"
                                    suffix="px"
                                    onCommit={(value) => {
                                        const parsed = Number.parseFloat(value);
                                        if (!Number.isNaN(parsed)) {
                                            handleFontSizeChange(parsed);
                                        }
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <FieldLabel>Weight</FieldLabel>
                                <DraftInput
                                    value={fontWeightValue}
                                    placeholder="400"
                                    onCommit={(value) => handleFontWeightChange(value || '400')}
                                />
                            </div>
                        </div>

                        <FieldRow label="Align" align="start">
                            <AlignButtons
                                value={textState.textAlign}
                                onChange={handleTextAlignChange}
                            />
                        </FieldRow>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <FieldLabel>Line height</FieldLabel>
                                <DraftInput
                                    value={textState.lineHeight}
                                    placeholder="1.5"
                                    onCommit={handleLineHeightChange}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <FieldLabel>Letter spacing</FieldLabel>
                                <DraftInput
                                    value={textState.letterSpacing}
                                    placeholder="0px"
                                    onCommit={(value) => handleLetterSpacingChange(value || '0')}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <FieldLabel>Transform</FieldLabel>
                                <SelectField
                                    value={textState.capitalization}
                                    options={TEXT_TRANSFORM_OPTIONS}
                                    onValueChange={handleCapitalizationChange}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <FieldLabel>Decoration</FieldLabel>
                                <SelectField
                                    value={textState.textDecorationLine}
                                    options={TEXT_DECORATION_OPTIONS}
                                    onValueChange={handleTextDecorationChange}
                                />
                            </div>
                        </div>
                    </Section>
                )}
            </div>
        </ScrollArea>
    );
});
