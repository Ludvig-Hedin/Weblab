'use client';

import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ColorStyle, TextStyle, VariableToken } from '@weblab/models/style';
import { BrandTabValue, LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

interface ConnectTokenPickerProps {
    /** CSS property the user is binding (filters which token kinds are shown). */
    property: string;
    /** Active binding name, if any — shown at the top with an Unbind action. */
    activeBindingName?: string;
    /** Whether the active binding is a Text Style (typography apply mode). */
    activeBindingIsTextStyle?: boolean;
    onBindColorStyle: (name: string) => void;
    onBindVariable: (varName: string) => void;
    onBindTextStyle: (name: string) => void;
    onUnbind: () => void;
    onClose: () => void;
}

/**
 * Token picker shown when the user clicks the `+` affordance next to a
 * property in the right-panel inspector. Filters the available tokens by
 * property type and surfaces the existing left-panel tabs for management.
 */
export const ConnectTokenPicker = observer(function ConnectTokenPicker({
    property,
    activeBindingName,
    activeBindingIsTextStyle,
    onBindColorStyle,
    onBindVariable,
    onBindTextStyle,
    onUnbind,
    onClose,
}: ConnectTokenPickerProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [query, setQuery] = useState('');

    const candidates = useMemo(() => tokens.applicableTokensFor(property), [tokens, property]);

    const filter = <T extends { name: string; displayName: string }>(items: T[]): T[] => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (i) => i.name.toLowerCase().includes(q) || i.displayName.toLowerCase().includes(q),
        );
    };

    const colorStyles = filter(candidates.colorStyles);
    const textStyles = filter(candidates.textStyles);
    const variables = filter(candidates.variables);

    const isEmpty = colorStyles.length === 0 && textStyles.length === 0 && variables.length === 0;

    const openTab = (tab: BrandTabValue) => {
        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRAND);
        editorEngine.state.setBrandTab(tab);
        onClose();
    };

    // Pick the management tab from the *property* (stable), not the current
    // candidate counts (which churn with the search filter). Typography
    // properties go to text styles; color goes to color styles; everything
    // else falls through to variables.
    const TYPOGRAPHY_PROPS = new Set([
        'font-family',
        'font-weight',
        'font-size',
        'line-height',
        'letter-spacing',
        'color',
        'text-transform',
        'text-decoration-line',
        'font-style',
    ]);
    const COLOR_PROPS = new Set([
        'color',
        'background-color',
        'border-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline-color',
        'fill',
        'stroke',
    ]);
    const manageTab = TYPOGRAPHY_PROPS.has(property)
        ? BrandTabValue.TEXT_STYLES
        : COLOR_PROPS.has(property)
          ? BrandTabValue.COLOR_STYLES
          : BrandTabValue.VARIABLES;

    if (!tokens.hasTokensLayer) {
        return (
            <div className="text-mini flex flex-col gap-3 p-3">
                <div className="text-foreground-secondary">
                    This project doesn’t have a design tokens layer yet.
                </div>
                <Button
                    size="sm"
                    onClick={async () => {
                        await tokens.scaffoldDefault();
                        onClose();
                    }}
                >
                    Set up design tokens
                </Button>
            </div>
        );
    }

    return (
        <div className="flex max-h-[420px] w-[280px] flex-col">
            <div className="border-border flex items-center gap-2 border-b px-2 py-1.5">
                <Icons.MagnifyingGlass className="text-foreground-secondary h-3.5 w-3.5" />
                <Input
                    autoFocus
                    placeholder="Search tokens…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="text-mini h-6 border-0 bg-transparent px-0 focus-visible:ring-0"
                />
            </div>

            {activeBindingName && (
                <button
                    type="button"
                    onClick={() => {
                        onUnbind();
                        onClose();
                    }}
                    className="border-border hover:bg-background-secondary text-mini flex items-center gap-2 border-b px-3 py-2 text-left"
                >
                    <Icons.LinkNone className="text-foreground-secondary h-3.5 w-3.5" />
                    <div className="flex flex-col">
                        <span className="text-foreground-primary">Unbind</span>
                        <span className="text-foreground-secondary text-micro">
                            {activeBindingIsTextStyle
                                ? 'Remove text style'
                                : `Currently: ${activeBindingName}`}
                        </span>
                    </div>
                </button>
            )}

            <div className="flex-1 overflow-y-auto py-1">
                {isEmpty && (
                    <div className="text-foreground-secondary text-mini px-3 py-3">
                        No tokens match.
                    </div>
                )}

                {textStyles.length > 0 && (
                    <PickerSection title="Text Styles">
                        {textStyles.map((ts) => (
                            <TextStyleRow
                                key={ts.name}
                                style={ts}
                                active={ts.name === activeBindingName}
                                onSelect={() => {
                                    onBindTextStyle(ts.name);
                                    onClose();
                                }}
                            />
                        ))}
                    </PickerSection>
                )}

                {colorStyles.length > 0 && (
                    <PickerSection title="Color Styles">
                        {colorStyles.map((cs) => (
                            <ColorStyleRow
                                key={cs.name}
                                style={cs}
                                active={cs.name === activeBindingName}
                                resolvedValue={
                                    tokens.resolveVariableValue(
                                        cs.refLight.type === 'var' ? cs.refLight.var : '',
                                    ) ?? (cs.refLight.type === 'literal' ? cs.refLight.value : '')
                                }
                                onSelect={() => {
                                    onBindColorStyle(cs.name);
                                    onClose();
                                }}
                            />
                        ))}
                    </PickerSection>
                )}

                {variables.length > 0 && (
                    <PickerSection title="Variables">
                        {variables.map((v) => (
                            <VariableRow
                                key={v.name}
                                variable={v}
                                active={v.name === activeBindingName}
                                onSelect={() => {
                                    onBindVariable(v.name);
                                    onClose();
                                }}
                            />
                        ))}
                    </PickerSection>
                )}
            </div>

            <div className="border-border border-t px-2 py-1.5">
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-mini text-foreground-secondary h-6 w-full justify-start"
                    onClick={() => openTab(manageTab)}
                >
                    <Icons.Gear className="mr-1.5 h-3 w-3" />
                    Manage tokens
                </Button>
            </div>
        </div>
    );
});

function PickerSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 px-1 py-1">
            <div className="text-foreground-secondary text-micro px-2 py-1">{title}</div>
            {children}
        </div>
    );
}

function ColorStyleRow({
    style,
    resolvedValue,
    active,
    onSelect,
}: {
    style: ColorStyle;
    resolvedValue: string;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'hover:bg-background-secondary text-mini flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left',
                active && 'bg-background-secondary',
            )}
        >
            <span
                aria-hidden
                className="h-3.5 w-3.5 rounded-sm border border-black/10"
                style={{ backgroundColor: resolvedValue || '#000000' }}
            />
            <span className="text-foreground-primary flex-1 truncate">{style.displayName}</span>
            <span className="text-foreground-secondary text-micro truncate">{resolvedValue}</span>
        </button>
    );
}

function TextStyleRow({
    style,
    active,
    onSelect,
}: {
    style: TextStyle;
    active: boolean;
    onSelect: () => void;
}) {
    const previewSize = style.resolved.fontSize ?? '0.875rem';
    const previewWeight = style.resolved.fontWeight ?? '500';
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'hover:bg-background-secondary text-mini flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left',
                active && 'bg-background-secondary',
            )}
        >
            <span
                aria-hidden
                className="text-foreground-primary inline-block min-w-[18px] text-center"
                style={{ fontSize: previewSize, fontWeight: previewWeight, lineHeight: 1 }}
            >
                Aa
            </span>
            <span className="text-foreground-primary flex-1 truncate">{style.displayName}</span>
            <span className="text-foreground-secondary text-micro">
                {style.resolved.fontSize ?? ''}
            </span>
        </button>
    );
}

function VariableRow({
    variable,
    active,
    onSelect,
}: {
    variable: VariableToken;
    active: boolean;
    onSelect: () => void;
}) {
    const isColor = variable.group === 'color';
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'hover:bg-background-secondary text-mini flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left',
                active && 'bg-background-secondary',
            )}
        >
            {isColor ? (
                <span
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-sm border border-black/10"
                    style={{ backgroundColor: variable.light || '#000000' }}
                />
            ) : (
                <span
                    aria-hidden
                    className="text-foreground-secondary text-micro inline-block w-[14px] text-center"
                >
                    {variable.group[0]?.toUpperCase()}
                </span>
            )}
            <span className="text-foreground-primary flex-1 truncate">{variable.displayName}</span>
            <span className="text-foreground-secondary text-micro max-w-[100px] truncate">
                {variable.light}
            </span>
        </button>
    );
}
