import { makeAutoObservable } from 'mobx';

import type {
    ColorStyle,
    ColorStyleRef,
    StyleBinding,
    TextStyle,
    VariableGroup,
    VariableToken,
} from '@weblab/models/style';

import type { EditorEngine } from '../engine';
import { DEFAULT_GLOBALS_TOKENS_SCAFFOLD } from './scaffold';
import {
    parseTokensFromGlobalsCss,
    removeTextStyleUtility,
    removeThemeVariable,
    renameThemeVariable,
    setDarkVariable,
    setTextStyleUtility,
    setThemeVariable,
    snapshotFromScan,
    TOKENS_TEXT_STYLE_PREFIX,
} from './util';

/** CSS properties that accept color values — used to filter the picker. */
const COLOR_PROPERTIES = new Set([
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
    'caret-color',
    'text-decoration-color',
    '-webkit-text-stroke-color',
]);

const SPACE_PROPERTIES = new Set([
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'gap',
    'row-gap',
    'column-gap',
    'top',
    'right',
    'bottom',
    'left',
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
]);

const FONT_PROPERTIES = new Set([
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
]);

const RADIUS_PROPERTIES = new Set([
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
]);

const SHADOW_PROPERTIES = new Set(['box-shadow', 'text-shadow']);

const TYPOGRAPHY_PROPERTIES = new Set([
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

const VAR_REGEX = /var\(--([a-zA-Z0-9_-]+)\)/;

/**
 * Single owner of design-token state for the editor.
 *
 * Reads/writes the user's `globals.css` directly through the active sandbox.
 * Exposes three observable registries (Variables, Color Styles, Text Styles)
 * plus resolvers used by the right-panel binding picker.
 */
export class TokensManager {
    variables: VariableToken[] = [];
    colorStyles: ColorStyle[] = [];
    textStyles: TextStyle[] = [];
    private _hasThemeBlock = false;
    private _hasDarkBlock = false;
    private _cssPath: string | null = null;
    private _scanInFlight: Promise<void> | null = null;
    /** Bumped on clear() so an in-flight scan can detect it was cancelled and
     * skip writing back stale registries. */
    private _scanGeneration = 0;
    /** Last scan error surfaced to UI (e.g. a banner above the tokens panel). */
    scanError: string | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get hasTokensLayer(): boolean {
        return this._hasThemeBlock;
    }

    get cssPath(): string | null {
        return this._cssPath;
    }

    get hasDarkBlock(): boolean {
        return this._hasDarkBlock;
    }

    /** Re-read globals.css and rebuild registries. Cheap — call freely.
     *
     * Concurrent callers join the same in-flight promise so every awaiter
     * sees post-scan state instead of a stale registry.
     */
    async scan(): Promise<void> {
        if (this._scanInFlight) return this._scanInFlight;
        this._scanInFlight = this.runScan().finally(() => {
            this._scanInFlight = null;
        });
        return this._scanInFlight;
    }

    private async runScan(): Promise<void> {
        const generation = this._scanGeneration;
        const isCurrent = () => generation === this._scanGeneration;
        const resetState = () => {
            this.variables = [];
            this.colorStyles = [];
            this.textStyles = [];
            this._hasThemeBlock = false;
            this._hasDarkBlock = false;
        };
        try {
            const path = await this.findGlobalsCssPath();
            if (!isCurrent()) return;
            this._cssPath = path;
            if (!path) {
                resetState();
                this.scanError = null;
                return;
            }
            const content = await this.editorEngine.activeSandbox.readFile(path);
            if (!isCurrent()) return;
            if (typeof content !== 'string') {
                resetState();
                this.scanError = null;
                return;
            }
            const scan = parseTokensFromGlobalsCss(content);
            const snap = snapshotFromScan(scan);
            if (!isCurrent()) return;
            this.variables = snap.variables;
            this.colorStyles = snap.colorStyles;
            this.textStyles = snap.textStyles;
            this._hasThemeBlock = snap.hasThemeBlock;
            this._hasDarkBlock = snap.hasDarkBlock;
            this.scanError = null;
        } catch (error) {
            console.error('TokensManager.scan failed', error);
            if (!isCurrent()) return;
            resetState();
            this.scanError = error instanceof Error ? error.message : 'Failed to read globals.css';
        }
    }

    private async findGlobalsCssPath(): Promise<string | null> {
        try {
            const list = await this.editorEngine.activeSandbox.listAllFiles();
            const match = list.find((f) => f.path.endsWith('globals.css'));
            return match?.path ?? null;
        } catch {
            return null;
        }
    }

    private async readCss(): Promise<string | null> {
        if (!this._cssPath) await this.scan();
        if (!this._cssPath) {
            console.warn(
                'TokensManager: globals.css not found — call scaffoldDefault() first or skip the token mutation',
            );
            return null;
        }
        const content = await this.editorEngine.activeSandbox.readFile(this._cssPath);
        if (typeof content !== 'string') {
            console.warn(`TokensManager: failed to read ${this._cssPath}`);
            return null;
        }
        return content;
    }

    private async writeCss(content: string): Promise<void> {
        if (!this._cssPath) {
            console.warn('TokensManager.writeCss: no _cssPath set — write skipped');
            return;
        }
        await this.editorEngine.activeSandbox.writeFile(this._cssPath, content);
    }

    /** Prepend the default token scaffold to globals.css if no `@theme` block exists. */
    async scaffoldDefault(): Promise<void> {
        const path = await this.findGlobalsCssPath();
        if (!path) {
            console.warn('TokensManager.scaffoldDefault: no globals.css found');
            return;
        }
        this._cssPath = path;
        const existing = await this.editorEngine.activeSandbox.readFile(path);
        // Bail if sandbox returned bytes — overwriting binary CSS with the
        // scaffold + empty string would silently destroy the user's content.
        if (existing != null && typeof existing !== 'string') {
            console.warn(
                `TokensManager.scaffoldDefault: ${path} returned non-string content, refusing to overwrite`,
            );
            return;
        }
        const existingStr = existing ?? '';
        if (existingStr.includes('@theme')) {
            await this.scan();
            return;
        }
        const next = `${DEFAULT_GLOBALS_TOKENS_SCAFFOLD}\n${existingStr}`;
        await this.editorEngine.activeSandbox.writeFile(path, next);
        await this.scan();
    }

    // ── Variables CRUD ───────────────────────────────────────────────────────
    async addVariable(input: { name: string; light: string; dark?: string | null }): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        let next = await setThemeVariable(css, input.name, input.light);
        if (input.dark != null) next = await setDarkVariable(next, input.name, input.dark);
        await this.writeCss(next);
        await this.scan();
    }

    async updateVariable(
        name: string,
        update: { light?: string; dark?: string | null },
    ): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        let next = css;
        if (update.light !== undefined) {
            next = await setThemeVariable(next, name, update.light);
        }
        if (update.dark !== undefined) {
            next = await setDarkVariable(next, name, update.dark);
        }
        await this.writeCss(next);
        await this.scan();
    }

    async renameVariable(oldName: string, newName: string): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        const next = await renameThemeVariable(css, oldName, newName);
        await this.writeCss(next);
        await this.scan();
    }

    async deleteVariable(name: string): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        const next = await removeThemeVariable(css, name);
        await this.writeCss(next);
        await this.scan();
    }

    // ── Color Styles CRUD ────────────────────────────────────────────────────
    /**
     * A Color Style is just a `--color-<name>` declaration whose value is a
     * `var(--…)` reference (or a literal). Stored alongside variables in the
     * same `@theme` block; round-trips via the scan splitter.
     */
    async addColorStyle(input: {
        name: string;
        refLight: ColorStyleRef;
        refDark?: ColorStyleRef | null;
    }): Promise<void> {
        const fullName = input.name.startsWith('color-') ? input.name : `color-${input.name}`;
        await this.addVariable({
            name: fullName,
            light: refToCss(input.refLight),
            dark: input.refDark ? refToCss(input.refDark) : null,
        });
    }

    async updateColorStyle(
        name: string,
        update: { refLight?: ColorStyleRef; refDark?: ColorStyleRef | null },
    ): Promise<void> {
        await this.updateVariable(name, {
            light: update.refLight ? refToCss(update.refLight) : undefined,
            dark:
                update.refDark === undefined
                    ? undefined
                    : update.refDark
                      ? refToCss(update.refDark)
                      : null,
        });
    }

    async renameColorStyle(oldName: string, newName: string): Promise<void> {
        const fullOld = oldName.startsWith('color-') ? oldName : `color-${oldName}`;
        const fullNew = newName.startsWith('color-') ? newName : `color-${newName}`;
        await this.renameVariable(fullOld, fullNew);
    }

    async deleteColorStyle(name: string): Promise<void> {
        const full = name.startsWith('color-') ? name : `color-${name}`;
        await this.deleteVariable(full);
    }

    // ── Text Styles CRUD ─────────────────────────────────────────────────────
    async addTextStyle(input: { name: string; applyClasses: string[] }): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        const next = await setTextStyleUtility(css, input.name, input.applyClasses);
        await this.writeCss(next);
        await this.scan();
    }

    async updateTextStyle(name: string, applyClasses: string[]): Promise<void> {
        await this.addTextStyle({ name, applyClasses });
    }

    async renameTextStyle(oldName: string, newName: string): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        const existing = this.textStyles.find((t) => t.name === oldName);
        if (!existing) return;
        let next = await removeTextStyleUtility(css, oldName);
        next = await setTextStyleUtility(next, newName, existing.applyClasses);
        await this.writeCss(next);
        await this.scan();
    }

    async deleteTextStyle(name: string): Promise<void> {
        const css = await this.readCss();
        if (css == null) return;
        const next = await removeTextStyleUtility(css, name);
        await this.writeCss(next);
        await this.scan();
    }

    // ── Resolvers used by useStyleValue / picker ─────────────────────────────
    /**
     * Map a resolved CSS value (hex, rgb, oklch, …) back to the Color Style
     * that produced it, when one matches. Lets us show the binding chip on
     * elements whose className is a Tailwind utility (e.g. `bg-brand-primary`)
     * — the resolved value is what `useStyleValue` sees.
     */
    resolveColorStyleByValue(value: string): ColorStyle | null {
        if (!value) return null;
        const normalised = value.trim().toLowerCase();
        for (const style of this.colorStyles) {
            const ref = style.refLight;
            if (ref.type === 'literal' && ref.value.trim().toLowerCase() === normalised) {
                return style;
            }
            if (ref.type === 'var') {
                const resolved = this.resolveVariableValue(ref.var);
                if (resolved && resolved.trim().toLowerCase() === normalised) return style;
            }
        }
        return null;
    }

    /** Map a `var(--name)` reference to its resolved value (theme block).
     *
     * Recurses through alias chains (e.g. `--brand-primary: var(--blue-500)`)
     * so callers always get a literal. Cycle-protected.
     */
    resolveVariableValue(varName: string): string | null {
        const seen = new Set<string>();
        let current: string | null = varName;
        while (current && !seen.has(current)) {
            seen.add(current);
            const v = this.variables.find((x) => x.name === current);
            if (!v) return null;
            const m = VAR_REGEX.exec(v.light.trim());
            if (!m?.[1]) return v.light;
            current = m[1];
        }
        return null;
    }

    resolveVariableByName(name: string): VariableToken | null {
        return this.variables.find((v) => v.name === name) ?? null;
    }

    resolveColorStyleByName(name: string): ColorStyle | null {
        return this.colorStyles.find((s) => s.name === name) ?? null;
    }

    /** Detect a `var(--…)` reference inside any value (inline or arbitrary class). */
    detectVariableInValue(value: string): { varName: string; resolved: string } | null {
        if (!value) return null;
        const m = VAR_REGEX.exec(value);
        if (!m?.[1]) return null;
        const resolved = this.resolveVariableValue(m[1]);
        return { varName: m[1], resolved: resolved ?? value };
    }

    /** Detect a known `text-style-*` class name in a className string. */
    detectTextStyleInClassName(className: string): TextStyle | null {
        if (!className) return null;
        for (const cls of className.split(/\s+/)) {
            if (!cls.startsWith(TOKENS_TEXT_STYLE_PREFIX)) continue;
            const name = cls.slice(TOKENS_TEXT_STYLE_PREFIX.length);
            const ts = this.textStyles.find((t) => t.name === name);
            if (ts) return ts;
        }
        return null;
    }

    /** Compute the binding (if any) for a property+value+className triple. */
    detectBinding(property: string, value: string, className: string | null): StyleBinding | null {
        if (TYPOGRAPHY_PROPERTIES.has(property) && className) {
            const ts = this.detectTextStyleInClassName(className);
            if (ts) {
                return {
                    kind: 'text-style',
                    name: ts.name,
                    displayName: ts.displayName,
                    resolved: ts.resolved.fontSize ?? '',
                };
            }
        }
        const varHit = this.detectVariableInValue(value);
        if (varHit) {
            const cs = this.colorStyles.find((s) => s.name === varHit.varName);
            if (cs) {
                return {
                    kind: 'color-style',
                    name: cs.name,
                    displayName: cs.displayName,
                    resolved: varHit.resolved,
                };
            }
            return {
                kind: 'variable',
                name: varHit.varName,
                displayName:
                    this.resolveVariableByName(varHit.varName)?.displayName ?? varHit.varName,
                resolved: varHit.resolved,
            };
        }
        // Hex / rgb match on color properties — could be a Tailwind utility
        // expanding to a Color Style's value.
        if (COLOR_PROPERTIES.has(property)) {
            const cs = this.resolveColorStyleByValue(value);
            if (cs) {
                return {
                    kind: 'color-style',
                    name: cs.name,
                    displayName: cs.displayName,
                    resolved: value,
                };
            }
        }
        return null;
    }

    /** Tokens applicable to a CSS property (used by the picker). */
    applicableTokensFor(property: string): {
        colorStyles: ColorStyle[];
        textStyles: TextStyle[];
        variables: VariableToken[];
    } {
        const wantsColor = COLOR_PROPERTIES.has(property);
        const wantsSpace = SPACE_PROPERTIES.has(property);
        const wantsFont = FONT_PROPERTIES.has(property);
        const wantsRadius = RADIUS_PROPERTIES.has(property);
        const wantsShadow = SHADOW_PROPERTIES.has(property);
        const wantsTypography = TYPOGRAPHY_PROPERTIES.has(property);

        const wantedGroup = (g: VariableGroup): boolean =>
            (wantsColor && g === 'color') ||
            (wantsSpace && g === 'space') ||
            (wantsFont && g === 'font') ||
            (wantsRadius && g === 'radius') ||
            (wantsShadow && g === 'shadow');

        return {
            colorStyles: wantsColor ? this.colorStyles : [],
            textStyles: wantsTypography ? this.textStyles : [],
            variables: this.variables.filter((v) => wantedGroup(v.group)),
        };
    }

    /**
     * Apply (or unbind) a Text Style to every selected element.
     *
     * For each selected element we read the current className, strip any
     * existing `text-style-*` token, append the new one (or none on unbind),
     * and route the change through `code.updateElementMetadata` so the JSX
     * source is rewritten in place.
     */
    async applyTextStyleToSelected(textStyleName: string | null): Promise<void> {
        const selected = this.editorEngine.elements.selected;
        if (selected.length === 0) return;
        const updates = selected
            .filter((el) => !!el.oid)
            .map((el) => {
                const existingClassName = el.className ?? '';
                const filtered = existingClassName
                    .split(/\s+/)
                    .filter((c: string) => c && !c.startsWith(TOKENS_TEXT_STYLE_PREFIX));
                if (textStyleName) {
                    filtered.push(`${TOKENS_TEXT_STYLE_PREFIX}${textStyleName}`);
                }
                return {
                    el,
                    nextClassName: filtered.join(' ').trim(),
                };
            });
        // Run in parallel — any failure rejects the whole call so callers can
        // surface a single error rather than silently leaving partial state.
        await Promise.all(
            updates.map(({ el, nextClassName }) =>
                this.editorEngine.code.updateElementMetadata({
                    oid: el.oid!,
                    branchId: el.branchId,
                    attributes: { className: nextClassName },
                    overrideClasses: true,
                }),
            ),
        );
    }

    clear() {
        this._scanGeneration++;
        this._scanInFlight = null;
        this.variables = [];
        this.colorStyles = [];
        this.textStyles = [];
        this._hasThemeBlock = false;
        this._hasDarkBlock = false;
        this._cssPath = null;
        this.scanError = null;
    }
}

function refToCss(ref: ColorStyleRef): string {
    return ref.type === 'var' ? `var(--${ref.var})` : ref.value;
}
