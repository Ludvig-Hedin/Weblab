import { makeAutoObservable } from 'mobx';

import { toast } from '@weblab/ui/sonner';

import type { EditorEngine } from '../engine';

/**
 * Visual-only CSS property whitelist for Figma/Framer-style "Copy Properties".
 *
 * Captures the subset a designer expects to round-trip: typography, color,
 * background, border (per-side + per-corner), spacing, size, layout,
 * effects, transforms, transitions, cursor. Excludes content-bearing or
 * structurally-foundational props (`content`, `src`, `overflow`,
 * `box-sizing`) — pasting those would change *what* an element is, not
 * just how it looks.
 *
 * Names stay in kebab-case: `getComputedStyleByDomId` returns the
 * preload `getStyles()` snapshot which JSON-clones `getComputedStyle` and
 * yields camelCase keys, so we normalize incoming keys to kebab before
 * the lookup.
 */
const VISUAL_PROPS: readonly string[] = [
    // Typography
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-decoration',
    'text-transform',
    'color',
    'white-space',
    // Background
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    // Border — per-side widths/styles/colors + per-corner radii
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    // Spacing
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    // Size
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    // Layout
    'display',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'align-content',
    'gap',
    'column-gap',
    'row-gap',
    'grid-template-columns',
    'grid-template-rows',
    'grid-auto-flow',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'z-index',
    // Effects
    'opacity',
    'box-shadow',
    'filter',
    'backdrop-filter',
    'mix-blend-mode',
    // Transform / transition
    'transform',
    'transform-origin',
    'transition',
    // Cursor
    'cursor',
] as const;

const VISUAL_PROPS_SET: ReadonlySet<string> = new Set(VISUAL_PROPS);

/**
 * Per-property values that `getComputedStyle` returns by default on an
 * unstyled element. Pasting these would explicitly set a property where
 * it was previously unset on the target — polluting the JSX with `none`,
 * `normal`, etc. that have no visible effect.
 *
 * Conservatively scoped to properties whose default carries no semantic
 * meaning (effects, transforms, transitions, blend modes). Layout-meaningful
 * defaults (`position: static`, `display: block`, `opacity: 1`, length
 * `auto`) stay copied — they're often intentional resets and dropping them
 * would silently change pasted behavior.
 */
const NOOP_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
    transition: new Set(['all 0s ease 0s', 'none 0s ease 0s', '0s ease 0s', 'all', 'none']),
    transform: new Set(['none']),
    'transform-origin': new Set(['']),
    filter: new Set(['none']),
    'backdrop-filter': new Set(['none']),
    'box-shadow': new Set(['none']),
    'background-image': new Set(['none']),
    'mix-blend-mode': new Set(['normal']),
};

function isNoopValue(property: string, value: string): boolean {
    const noop = NOOP_VALUES[property];
    return noop ? noop.has(value.trim()) : false;
}

/** System-clipboard envelope so paste survives reloads and cross-tab use. */
const CLIPBOARD_ENVELOPE_TYPE = 'weblab-properties';
const CLIPBOARD_ENVELOPE_VERSION = 1 as const;

interface PropertiesEnvelope {
    type: typeof CLIPBOARD_ENVELOPE_TYPE;
    version: typeof CLIPBOARD_ENVELOPE_VERSION;
    styles: Record<string, string>;
}

/**
 * `paddingTop` → `padding-top`, `WebkitBoxOrient` → `-webkit-box-orient`.
 * Custom properties (`--foo`) pass through unchanged.
 */
function toKebabCase(prop: string): string {
    if (prop.startsWith('--')) return prop;
    return prop
        .replace(/^([A-Z])/, (m) => `-${m.toLowerCase()}`)
        .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Filter a raw style record to the visual-props whitelist, dropping empty
 * values. Accepts camelCase or kebab-case keys.
 */
export function filterToVisualProps(raw: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== 'string' || value === '') continue;
        const kebab = toKebabCase(key);
        if (!VISUAL_PROPS_SET.has(kebab)) continue;
        if (isNoopValue(kebab, value)) continue;
        out[kebab] = value;
    }
    return out;
}

/**
 * Figma/Framer-style "Copy Properties" / "Paste Properties".
 *
 * Lives alongside `CopyManager` but deliberately separate: `CopyManager`
 * duplicates the DOM element (its JSX, children, attributes), while this
 * manager only round-trips the *visual styling* via the existing
 * `StyleManager.updateMultiple` pipeline so undo/redo + AST sync work
 * unchanged.
 *
 * Storage is dual-layer:
 *   - in-memory `copied` (MobX observable) for fast same-session paste,
 *     keeps menu disabled-state reactive.
 *   - system clipboard with a versioned JSON envelope so a reload or a
 *     fresh tab can still paste.
 */
export class PropertiesClipboardManager {
    copied: Record<string, string> | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get canPaste(): boolean {
        return this.copied !== null;
    }

    /**
     * Read the visual subset of the first-selected element's computed
     * styles into the internal clipboard AND the system clipboard.
     */
    async copyFromSelected(): Promise<void> {
        const source = this.editorEngine.elements.selected[0];
        if (!source) {
            toast.info('Select an element to copy properties from');
            return;
        }
        const frameData = this.editorEngine.frames.get(source.frameId);
        if (!frameData?.view) {
            toast.error('Cannot copy properties — frame not ready');
            return;
        }

        // Pull the live computed styles from the iframe. Falls back to the
        // styles already cached on the DomElement so a penpal hiccup mid-edit
        // still produces a useful (if reduced) copy instead of failing silently.
        let raw: Record<string, unknown> | null = null;
        try {
            const result = await frameData.view.getComputedStyleByDomId(source.domId);
            if (result && typeof result === 'object') {
                raw = result;
            }
        } catch (err) {
            console.warn('Failed to read computed styles for copy properties', err);
        }
        raw ??= {
            ...(source.styles?.computed ?? {}),
            ...(source.styles?.defined ?? {}),
        };

        const styles = filterToVisualProps(raw);
        if (Object.keys(styles).length === 0) {
            toast.error('No visual properties available to copy');
            return;
        }
        this.copied = styles;

        // System-clipboard write is best-effort. Failure (denied permission,
        // unfocused document) is non-fatal — the in-memory copy still works
        // for paste within the current session.
        try {
            const envelope: PropertiesEnvelope = {
                type: CLIPBOARD_ENVELOPE_TYPE,
                version: CLIPBOARD_ENVELOPE_VERSION,
                styles,
            };
            await navigator.clipboard.writeText(JSON.stringify(envelope));
        } catch (err) {
            console.warn('Failed to write properties to system clipboard', err);
        }

        toast.success('Properties copied');
    }

    /**
     * Apply the stored visual styles to every currently-selected element.
     *
     * `StyleManager.updateMultiple` reads `editorEngine.elements.selected`
     * itself and fans out one `StyleActionTarget` per selected element
     * (plus breakpoint-sibling frames), so a single call produces one
     * undoable history entry covering the whole selection.
     */
    async pasteToSelected(): Promise<void> {
        if (this.editorEngine.elements.selected.length === 0) {
            toast.info('Select an element to paste properties into');
            return;
        }

        let styles = this.copied;
        styles ??= await this.readFromSystemClipboard();
        if (!styles || Object.keys(styles).length === 0) {
            toast.info('Copy properties first');
            return;
        }

        // Re-read selection AFTER the async clipboard probe: between the
        // initial guard and now, the user may have clicked away. Bail again
        // if they did, otherwise the toast count would lie about what
        // `updateMultiple` actually wrote.
        const targetsNow = this.editorEngine.elements.selected;
        if (targetsNow.length === 0) {
            toast.info('Select an element to paste properties into');
            return;
        }

        this.editorEngine.style.updateMultiple(styles);

        const n = targetsNow.length;
        toast.success(`Properties pasted to ${n} element${n === 1 ? '' : 's'}`);
    }

    /**
     * Try to decode a properties envelope from the system clipboard.
     * Returns null when the clipboard text isn't ours (random text, other
     * apps, permission denied). Logging stays quiet — most failures here
     * are expected.
     */
    private async readFromSystemClipboard(): Promise<Record<string, string> | null> {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
            return null;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return null;
            const parsed = JSON.parse(text) as unknown;
            if (
                parsed &&
                typeof parsed === 'object' &&
                'type' in parsed &&
                (parsed as { type: unknown }).type === CLIPBOARD_ENVELOPE_TYPE &&
                'version' in parsed &&
                (parsed as { version: unknown }).version === CLIPBOARD_ENVELOPE_VERSION &&
                'styles' in parsed &&
                typeof (parsed as { styles: unknown }).styles === 'object' &&
                (parsed as { styles: unknown }).styles !== null
            ) {
                return filterToVisualProps(
                    (parsed as PropertiesEnvelope).styles as Record<string, unknown>,
                );
            }
        } catch {
            // Not JSON / not our envelope / permission denied.
        }
        return null;
    }

    clear() {
        this.copied = null;
    }
}
