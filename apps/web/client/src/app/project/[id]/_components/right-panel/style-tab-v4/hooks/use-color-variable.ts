'use client';

import { useEffect } from 'react';

import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import {
    classForColorLiteral,
    classForColorVariable,
    COLOR_CLASS_PREFIX,
} from '@/components/store/editor/tokens/color-binding';
import { EDITOR_SCOPE } from '@/lib/editor-scope';

export interface ColorVariableBinding {
    /** Variable name without `--` (e.g. `color-brand`). */
    varName: string;
    /** Label shown in the chip (e.g. `Brand/Primary`). */
    label: string;
    /** False for Tailwind's built-in palette, which has no entry in globals.css. */
    editable: boolean;
}

export interface ColorVariableOption {
    varName: string;
    label: string;
    /** Resolved value for the swatch. */
    swatch: string;
}

export interface ColorVariableControls {
    binding: ColorVariableBinding | null;
    options: ColorVariableOption[];
    /** Bind the property to a variable. */
    connect: (varName: string) => void;
    /** The color the browser renders right now, for detaching to a literal. */
    renderedColor: string;
    /** Replace the variable (or any color class) with a literal color. */
    detach: (literal: string) => void;
}

/** Strip the redundant `Color/` type prefix from a display name. */
function variableLabel(displayName: string): string {
    return displayName.replace(/^Color\//, '');
}

/**
 * Variable binding for one color property of the selected element. Returns
 * null controls when variables are out of scope, the property has no Tailwind
 * color prefix, or more than one element is selected with different classes.
 */
export function useColorVariable(property: string): ColorVariableControls | null {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const selected = editorEngine.elements.selected;
    const enabled = EDITOR_SCOPE.variables && property in COLOR_CLASS_PREFIX;

    useEffect(() => {
        // The panel may open before the Variables tab ever scanned globals.css.
        if (enabled && !tokens.cssPath) void tokens.scan();
    }, [enabled, tokens]);

    if (!enabled || selected.length === 0) return null;

    const hit = tokens.detectColorClassBinding(property, selected[0]?.className ?? '');
    const sameForAll = selected.every(
        (el) =>
            tokens.detectColorClassBinding(property, el.className ?? '')?.varName === hit?.varName,
    );
    const token = hit
        ? (tokens.resolveVariableByName(hit.varName) ?? tokens.resolveColorStyleByName(hit.varName))
        : null;
    const binding: ColorVariableBinding | null =
        hit && sameForAll
            ? {
                  varName: hit.varName,
                  label: token
                      ? variableLabel(token.displayName)
                      : hit.varName.replace(/^color-/, ''),
                  editable: token != null,
              }
            : null;

    const options: ColorVariableOption[] = [
        ...tokens.variables
            .filter((v) => v.group === 'color')
            .map((v) => ({
                varName: v.name,
                label: variableLabel(v.displayName),
                swatch: tokens.resolveVariableValue(v.name) ?? v.light,
            })),
        // Aliases like `--color-surface: var(--color-white)`.
        ...tokens.colorStyles.map((c) => ({
            varName: c.name,
            label: variableLabel(c.displayName),
            swatch:
                c.refLight.type === 'var'
                    ? (tokens.resolveVariableValue(c.refLight.var) ?? '')
                    : c.refLight.value,
        })),
    ];

    const write = (nextClass: string | null) => {
        tokens.setColorClassOnSelected(property, nextClass).catch((error: unknown) => {
            console.error('Failed to update color variable:', error);
            toast.error(error instanceof Error ? error.message : String(error));
        });
    };

    const computed = editorEngine.style.selectedStyle?.styles.computed ?? {};
    const camel = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const renderedColor = computed[camel] ?? computed[property] ?? '';

    return {
        binding,
        renderedColor,
        options,
        connect: (varName) => write(classForColorVariable(property, varName)),
        detach: (literal) => write(classForColorLiteral(property, literal)),
    };
}
