'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ColorStyle, VariableToken } from '@weblab/models/style';
import { Button } from '@weblab/ui/button';
import { ColorPicker } from '@weblab/ui/color-picker';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { Color } from '@weblab/utility';

import type { TokenRowData } from '../lib/group-tokens';
import type { ConfirmFn } from '../lib/token-mutations';
import { useEditorEngine } from '@/components/store/editor';
import { colorRefToString, parseColorRef, renameLeaf } from '../lib/token-mutations';

function Field({
    label,
    icon,
    children,
}: {
    label: string;
    icon?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center gap-2">
            <Label className="text-micro text-foreground-secondary flex w-11 shrink-0 items-center gap-1">
                {icon}
                {label}
            </Label>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function ValueInput({
    isColor,
    value,
    swatch,
    onChange,
    onCommit,
    onPickColor,
}: {
    isColor: boolean;
    value: string;
    /** Resolved color for the swatch (value itself may be a `var(--…)` ref). */
    swatch: string;
    onChange: (next: string) => void;
    onCommit: () => void;
    /** When set, the swatch opens a color picker that commits a literal hex. */
    onPickColor?: (hex: string) => void;
}) {
    return (
        <div className="flex items-center gap-1.5">
            {isColor &&
                (onPickColor ? (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-label="Pick color"
                                className="border-border size-5 shrink-0 cursor-pointer rounded border"
                                style={{ backgroundColor: swatch }}
                            />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[232px] p-2">
                            <ColorPicker
                                color={Color.from(swatch || '#000000')}
                                onChangeEnd={(next) => onPickColor(next.toHex())}
                            />
                        </PopoverContent>
                    </Popover>
                ) : (
                    <span
                        aria-hidden
                        className="border-border size-5 shrink-0 rounded border"
                        style={{ backgroundColor: swatch }}
                    />
                ))}
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="text-mini h-7"
            />
        </div>
    );
}

export interface VariableTokenEditorProps {
    /** Row of kind `color` | `color-alias` | `dimension` | `other`. */
    row: TokenRowData;
    onClose: () => void;
    confirm: ConfirmFn;
}

/**
 * Inline editor for every non-text token — color variables, color styles
 * (aliases), sizes, radius, and the catch-all "other" group. Progressive
 * disclosure: the compact row owns identity + value; the raw `--name`, the
 * dark-mode value, and the color picker surface here, not in the list.
 */
export const VariableTokenEditor = observer(function VariableTokenEditor({
    row,
    onClose,
    confirm,
}: VariableTokenEditorProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const isAlias = row.kind === 'color-alias';
    const isColor = row.kind === 'color' || isAlias;

    const variable = isAlias ? null : (row.token as VariableToken);
    const colorStyle = isAlias ? (row.token as ColorStyle) : null;

    const initialLight = colorStyle
        ? colorRefToString(colorStyle.refLight)
        : (variable?.light ?? '');
    const initialDark = colorStyle
        ? colorStyle.refDark
            ? colorRefToString(colorStyle.refDark)
            : ''
        : (variable?.dark ?? '');
    const initialHasDark = colorStyle ? colorStyle.refDark != null : variable?.dark != null;

    const [label, setLabel] = useState(row.label);
    const [light, setLight] = useState(initialLight);
    const [dark, setDark] = useState(initialDark);
    const [hasDark, setHasDark] = useState(initialHasDark);

    const commitName = async () => {
        const next = renameLeaf(row.name, label);
        if (next === row.name) return;
        if (isAlias) await tokens.renameColorStyle(row.name, next);
        else await tokens.renameVariable(row.name, next);
    };

    /** Persist explicit light/dark values — used by both the text inputs and
     * the color picker (which can't rely on async `setState` having flushed). */
    const persist = async (nextLight: string, nextDark: string | null) => {
        if (isAlias) {
            await tokens.updateColorStyle(row.name, {
                refLight: parseColorRef(nextLight),
                refDark: nextDark ? parseColorRef(nextDark) : null,
            });
        } else {
            await tokens.updateVariable(row.name, {
                light: nextLight,
                dark: nextDark,
            });
        }
    };

    const commitValues = () => persist(light, hasDark && dark.trim() ? dark.trim() : null);

    // Picking a literal hex through the picker would silently overwrite a
    // `var(--…)` reference — drop the picker affordance whenever the current
    // value IS a var ref. The user can still edit the ref via the text input.
    const isVarRef = (v: string) => v.trim().startsWith('var(--');
    const lightAllowsPicker = isColor && !isVarRef(light);
    const darkAllowsPicker = isColor && !isVarRef(dark);

    const pickColor = (mode: 'light' | 'dark', hex: string) => {
        if (mode === 'light') {
            setLight(hex);
            void persist(hex, hasDark && dark.trim() ? dark.trim() : null);
        } else {
            setDark(hex);
            setHasDark(true);
            void persist(light, hex);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Delete “${row.label}”?`,
            description: 'This token will be removed from globals.css and cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        if (isAlias) await tokens.deleteColorStyle(row.name);
        else await tokens.deleteVariable(row.name);
        onClose();
    };

    return (
        <div className="bg-background-secondary border-border mx-2 mb-1 flex flex-col gap-2 rounded-md border p-2.5">
            <Field label="Name">
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={() => void commitName()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className="text-mini h-7"
                />
            </Field>
            <Field label="Light" icon={<Icons.Sun className="size-3" />}>
                <ValueInput
                    isColor={isColor}
                    value={light}
                    swatch={isAlias ? row.value : light}
                    onChange={setLight}
                    onCommit={() => void commitValues()}
                    onPickColor={lightAllowsPicker ? (hex) => pickColor('light', hex) : undefined}
                />
            </Field>
            {hasDark ? (
                <Field label="Dark" icon={<Icons.Moon className="size-3" />}>
                    <ValueInput
                        isColor={isColor}
                        value={dark}
                        swatch={isAlias ? (row.darkValue ?? dark) : dark}
                        onChange={setDark}
                        onCommit={() => void commitValues()}
                        onPickColor={darkAllowsPicker ? (hex) => pickColor('dark', hex) : undefined}
                    />
                </Field>
            ) : (
                <button
                    type="button"
                    onClick={() => setHasDark(true)}
                    className="text-foreground-secondary hover:text-foreground-primary text-mini flex items-center gap-1.5 self-start"
                >
                    <Icons.Plus className="size-3" />
                    Add dark value
                </button>
            )}
            <div className="text-foreground-tertiary text-micro truncate font-mono">
                --{row.name}
            </div>
            <div className="flex items-center justify-between pt-0.5">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-7 px-2"
                    onClick={() => void handleDelete()}
                >
                    <Icons.Trash className="mr-1.5 size-3.5" />
                    Delete
                </Button>
                <Button size="sm" className="h-7" onClick={onClose}>
                    Done
                </Button>
            </div>
        </div>
    );
});
