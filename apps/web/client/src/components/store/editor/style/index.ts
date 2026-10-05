import type { CSSProperties } from 'react';
import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { BreakpointId, DomElement, DomElementStyles, Font } from '@weblab/models';
import type { StyleChange } from '@weblab/models/style';
import {
    type BreakpointActionContext,
    type Change,
    type StyleActionTarget,
    type UpdateStyleAction,
} from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { toast } from '@weblab/ui/sonner';
import { convertFontString } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import { breakpointMinWidth } from '../code/project-breakpoints';

export interface SelectedStyle {
    styles: DomElementStyles;
    parentRect: DOMRect;
    rect: DOMRect;
}

export enum StyleMode {
    Instance = 'instance',
    Root = 'root',
}

/**
 * Per-element responsive override snapshot maintained client-side.
 *
 *   oid → property → breakpointId → authored/computed entry
 *
 * The store updates this whenever a `update*` call commits a value, and the
 * style panel reads it to render the override-affordance (subtle blue
 * background + alt-click to clear). Source-write keeps these in sync over
 * iframe reloads.
 */
interface OverrideEntry {
    value: string;
    type: StyleChangeType;
    provenance: 'authored' | 'computed';
}

type OverrideMap = Map<string, Map<string, Map<BreakpointId, OverrideEntry>>>;

function normalizeProperty(property: string): string {
    if (property.startsWith('--')) return property;
    return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export class StyleManager {
    selectedStyle: SelectedStyle | null = null;
    domIdToStyle = new Map<string, SelectedStyle>();
    prevSelected = '';
    mode: StyleMode = StyleMode.Root;
    private selectedElementsReactionDisposer?: () => void;
    private overrides: OverrideMap = new Map();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    init() {
        this.selectedElementsReactionDisposer = reaction(
            () => this.editorEngine.elements.selected,
            (selectedElements) => this.onSelectedElementsChanged(selectedElements),
        );
        this.requestSourceRebase = (oid, property) => {
            this.editorEngine.action.requestSourceRebase(oid, property);
        };
    }

    private canWriteVisualStyle(): boolean {
        if (this.editorEngine.framework === 'static-html') {
            toast.error('Visual style editing is unavailable for static HTML', {
                id: 'static-html-style-unavailable',
                description: 'The current source writer requires Tailwind. Your project files were not changed.',
            });
            return false;
        }
        const branches = this.editorEngine.branches;
        if (
            branches?.hasActiveBranch &&
            branches.getStyleWriterForBranch(branches.activeBranch.id) === 'none'
        ) {
            toast.error('Visual style editing is unavailable for this local project', {
                id: 'local-style-unavailable',
                description: 'A wired Tailwind v4 App Router stylesheet is required. Reopen after changing style setup; text and code editing remain available.',
            });
            return false;
        }
        return true;
    }

    updateCustom(style: string, value: string, domIds: string[] = []) {
        if (!this.canWriteVisualStyle()) return;
        const styleObj = { [style]: value };
        const action = this.getUpdateStyleAction(styleObj, domIds, StyleChangeType.Custom);
        void this.editorEngine.action.run(action, () => {
            // Scope the mirror + override recording to the same domId subset
            // as the source action, after its write has succeeded.
            runInAction(() => {
                this.updateStyleNoAction(styleObj, domIds);
                this.recordOverrides(styleObj, domIds, StyleChangeType.Custom);
            });
        });
    }

    update(style: string, value: string) {
        return this.updateMultiple({ [style]: value });
    }

    updateMultiple(styles: Record<string, string>): Promise<boolean> {
        if (!this.canWriteVisualStyle()) return Promise.resolve(false);
        const action = this.getUpdateStyleAction(styles);
        return this.editorEngine.action.run(action, () => {
            runInAction(() => {
                this.updateStyleNoAction(styles);
                this.recordOverrides(styles);
            });
        });
    }

    updateFontFamily(style: string, value: Font) {
        if (!this.canWriteVisualStyle()) return;
        const styleObj = { [style]: value.id };
        const action = this.getUpdateStyleAction(styleObj);
        const formattedAction = {
            ...action,
            targets: action.targets.map((val) => ({
                ...val,
                change: {
                    original: Object.fromEntries(
                        Object.entries(val.change.original).map(([key, styleChange]) => [
                            key,
                            {
                                ...styleChange,
                                value: convertFontString(styleChange.value),
                            },
                        ]),
                    ),
                    updated: Object.fromEntries(
                        Object.entries(val.change.updated).map(([key, styleChange]) => [
                            key,
                            {
                                ...styleChange,
                                value: convertFontString(styleChange.value),
                            },
                        ]),
                    ),
                },
            })),
        };
        void this.editorEngine.action.run(formattedAction, () => {
            // The style mirror holds resolved CSS, while the override UI
            // tracks the font id. Responsive rebase skips font-family until
            // it can round-trip that identifier.
            runInAction(() => {
                this.updateStyleNoAction({ [style]: convertFontString(value.id) });
                this.recordOverrides({ [style]: value.id });
            });
        });
    }

    getUpdateStyleAction(
        styles: CSSProperties,
        domIds: string[] = [],
        type: StyleChangeType = StyleChangeType.Value,
    ): UpdateStyleAction {
        if (!this.editorEngine) {
            return {
                type: 'update-style',
                targets: [],
            };
        }
        const selected = this.editorEngine.elements.selected;
        const filteredSelected =
            domIds.length > 0 ? selected.filter((el) => domIds.includes(el.domId)) : selected;

        const breakpointCtx = this.activeBreakpointContext();

        // For every selected element, also fan out to its sibling frames in the
        // same breakpoint group so all responsive views update together. The
        // per-target breakpoint context records WHERE the edit applies.
        const targets: StyleActionTarget[] = [];
        for (const selectedEl of filteredSelected) {
            const change: Change<Record<string, StyleChange>> = {
                updated: Object.fromEntries(
                    Object.keys(styles).map((style) => [
                        style,
                        {
                            value: styles[style as keyof CSSProperties]?.toString() ?? '',
                            type:
                                type === StyleChangeType.Custom
                                    ? StyleChangeType.Custom
                                    : StyleChangeType.Value,
                        },
                    ]),
                ),
                original: Object.fromEntries(
                    Object.keys(styles).map((style) => [
                        style,
                        {
                            value:
                                selectedEl.styles?.defined[style] ??
                                selectedEl.styles?.computed[style] ??
                                '',
                            type: StyleChangeType.Value,
                        },
                    ]),
                ),
            };

            const oid = this.mode === StyleMode.Instance ? selectedEl.instanceId : selectedEl.oid;

            // Primary target: the frame the element was selected in.
            targets.push({
                frameId: selectedEl.frameId,
                branchId: selectedEl.branchId,
                domId: selectedEl.domId,
                oid,
                change,
                breakpoint: breakpointCtx,
            });

            // Sibling fan-out: every other frame in the same group whose iframe
            // already has a domId for this oid. The CSS manager wraps each
            // injection in @media so smaller siblings still receive the override
            // even though their viewport is below the threshold.
            const primaryFrame = this.editorEngine.frames.get(selectedEl.frameId);
            if (!primaryFrame) continue;
            const siblings = this.editorEngine.frames.getByGroupId(primaryFrame.frame.groupId);
            for (const sib of siblings) {
                if (sib.frame.id === selectedEl.frameId) continue;
                // We don't know the sibling's domId for this oid from here —
                // skip if there's no view yet. The action manager re-resolves
                // the domId when calling `view.updateStyle`.
                targets.push({
                    frameId: sib.frame.id,
                    branchId: sib.frame.branchId,
                    domId: selectedEl.domId,
                    oid,
                    change,
                    breakpoint: breakpointCtx,
                });
            }
        }

        return {
            type: 'update-style',
            targets,
        };
    }

    activeBreakpointContext(): BreakpointActionContext | undefined {
        const id = this.editorEngine.breakpoints?.activeId;
        if (!id) return undefined;
        const branchId = this.editorEngine.elements.selected[0]?.branchId;
        const frames = this.editorEngine.frames.getAll().filter((frame) => !branchId || frame.frame.branchId === branchId);
        const sample = frames.find((f) => f.frame.breakpoint?.id === id);
        const width =
            sample?.frame.breakpoint?.width ?? this.editorEngine.breakpoints.activeWidth();
        const name = sample?.frame.breakpoint?.name ?? id;
        const widths = frames.map((frame) => frame.frame.breakpoint?.width)
            .filter((value): value is number => value !== undefined);
        const base = widths.length > 0 ? Math.min(...widths) : null;
        return { id, name, minWidth: breakpointMinWidth(width, base) };
    }

    private recordOverrides(
        styles: Record<string, unknown>,
        domIds: string[] = [],
        type: StyleChangeType = StyleChangeType.Value,
    ) {
        // Same filter semantics as getUpdateStyleAction: an empty list means
        // the whole selection, a non-empty list restricts to those domIds.
        const filter = domIds.length > 0 ? new Set(domIds) : null;
        const breakpointId = this.editorEngine.breakpoints?.activeId ?? 'desktop';
        for (const selectedEl of this.editorEngine.elements.selected) {
            if (filter && !filter.has(selectedEl.domId)) continue;
            const oid = this.mode === StyleMode.Instance ? selectedEl.instanceId : selectedEl.oid;
            if (!oid) continue;
            const propMap = this.overrides.get(oid) ?? new Map();
            for (const [property, value] of Object.entries(styles)) {
                const key = normalizeProperty(property);
                const bpMap = propMap.get(key) ?? new Map<BreakpointId, OverrideEntry>();
                bpMap.set(breakpointId, {
                    value: String(value ?? ''),
                    type,
                    provenance: 'authored',
                });
                propMap.set(key, bpMap);
            }
            this.overrides.set(oid, propMap);
        }
        // Trigger MobX update by replacing the reference.
        this.overrides = new Map(this.overrides);
    }

    /**
     * Returns true when the property's value at the given breakpoint differs
     * from the cascade fallback (the next-larger breakpoint with a known
     * value). This matches the Framer mental model: an override badge means
     * "this value is specific to this breakpoint, not inherited."
     *
     * Returning users see badges immediately because the override map is
     * seeded from each sibling iframe's computed style on selection (see
     * `seedOverridesFromSiblings`) — not just from edits made this session.
     */
    isOverriddenAt(oid: string, property: string, breakpointId: BreakpointId): boolean {
        const bpMap = this.overrides.get(oid)?.get(normalizeProperty(property));
        if (!bpMap?.has(breakpointId)) return false;

        const current = bpMap.get(breakpointId);
        if (current?.type === StyleChangeType.Remove) return false;
        const myValue = current?.value;
        const myWidth = this.widthForBreakpoint(breakpointId);

        // Find the next-larger breakpoint that has a recorded value.
        let nextLarger: BreakpointId | null = null;
        let nextLargerWidth = Number.POSITIVE_INFINITY;
        for (const [id, entry] of bpMap) {
            if (id === breakpointId) continue;
            if (entry.type === StyleChangeType.Remove) continue;
            const w = this.widthForBreakpoint(id);
            if (w > myWidth && w < nextLargerWidth) {
                nextLarger = id;
                nextLargerWidth = w;
            }
        }

        // No larger breakpoint with a value → this is the de-facto base; not
        // an override. (Edits made at the largest breakpoint are the cascade
        // origin in our desktop-first UI.)
        if (!nextLarger) return false;

        return myValue !== bpMap.get(nextLarger)?.value;
    }

    private widthForBreakpoint(id: BreakpointId): number {
        const sample = this.editorEngine.frames.getAll().find((f) => f.frame.breakpoint?.id === id);
        if (sample) return sample.frame.breakpoint.width;
        if (id === 'phone') return 0;
        if (id === 'tablet') return 768;
        if (id === 'desktop') return 1024;
        return 0;
    }

    /**
     * Walk the selected element's sibling frames and pull their per-iframe
     * computed styles for that oid into the override map. Runs async,
     * non-blocking — the inputs render synchronously off whatever's already
     * recorded, then re-render via MobX once seeding lands.
     *
     * Failures (sibling not connected yet, oid missing in that iframe) are
     * silently skipped — they're expected during boot.
     */
    private async seedOverridesFromSiblings(selectedEl: DomElement) {
        const oid = this.mode === StyleMode.Instance ? selectedEl.instanceId : selectedEl.oid;
        if (!oid) return;
        const primary = this.editorEngine.frames.get(selectedEl.frameId);
        if (!primary) return;
        const siblings = this.editorEngine.frames.getByGroupId(primary.frame.groupId);
        if (siblings.length === 0) return;

        // Gather observations first, then merge into the CURRENT map after
        // the sibling RPCs settle. An edit may be authored during an RPC;
        // computed values must never replace that newer intent.
        const observed = new Map<string, Map<BreakpointId, string>>();
        const observe = (property: string, breakpointId: BreakpointId, value: string) => {
            const key = normalizeProperty(property);
            const bp = observed.get(key) ?? new Map<BreakpointId, string>();
            bp.set(breakpointId, value);
            observed.set(key, bp);
        };
        const primaryBp = primary.frame.breakpoint?.id;
        if (primaryBp && selectedEl.styles?.computed) {
            for (const [property, value] of Object.entries(selectedEl.styles.computed)) {
                if (typeof value !== 'string' || !value) continue;
                observe(property, primaryBp, value);
            }
        }

        // Fetch each sibling's computed styles for the same oid in parallel.
        const fetches = siblings
            .filter((sib) => sib.frame.id !== selectedEl.frameId && sib.view?.isPenpalReady())
            .map(async (sib) => {
                try {
                    const sibEl = await sib.view!.getElementByOid(oid, true);
                    if (!sibEl?.styles?.computed) return;
                    const bpId = sib.frame.breakpoint?.id;
                    if (!bpId) return;
                    for (const [property, value] of Object.entries(sibEl.styles.computed)) {
                        if (typeof value !== 'string' || !value) continue;
                        observe(property, bpId, value);
                    }
                } catch {
                    // Sibling not ready or oid missing — fine.
                }
            });
        await Promise.allSettled(fetches);

        const propMap =
            this.overrides.get(oid) ?? new Map<string, Map<BreakpointId, OverrideEntry>>();
        for (const [property, values] of observed) {
            const bpMap = propMap.get(property) ?? new Map<BreakpointId, OverrideEntry>();
            for (const [breakpointId, value] of values) {
                if (bpMap.get(breakpointId)?.provenance === 'authored') continue;
                bpMap.set(breakpointId, {
                    value,
                    type: StyleChangeType.Value,
                    provenance: 'computed',
                });
            }
            propMap.set(property, bpMap);
        }
        this.overrides.set(oid, propMap);
        // New Map reference so MobX observers re-evaluate.
        this.overrides = new Map(this.overrides);
    }

    /**
     * Sync the override map from a history-replayed (undo/redo) update-style
     * action. Unlike `recordOverrides`, this keys off the action target's own
     * oid and recorded breakpoint context instead of the current selection /
     * active breakpoint — the replayed elements may no longer be selected.
     * Keeping the map current matters because a later source rebase for the
     * same `(oid, property)` flushes whatever the map holds; a stale entry
     * would silently re-apply the undone value to source.
     */
    recordOverrideForOid(
        oid: string,
        breakpointId: BreakpointId,
        styles: Record<string, string | StyleChange>,
    ) {
        const propMap =
            this.overrides.get(oid) ?? new Map<string, Map<BreakpointId, OverrideEntry>>();
        for (const [property, change] of Object.entries(styles)) {
            const key = normalizeProperty(property);
            const bpMap = propMap.get(key) ?? new Map<BreakpointId, OverrideEntry>();
            bpMap.set(breakpointId, {
                value: typeof change === 'string' ? change : change.value,
                type: typeof change === 'string' ? StyleChangeType.Value : change.type,
                provenance: 'authored',
            });
            propMap.set(key, bpMap);
        }
        this.overrides.set(oid, propMap);
        // New Map reference so MobX observers re-evaluate.
        this.overrides = new Map(this.overrides);
    }

    /**
     * Get the recorded value for an `(oid, property, breakpoint)` triple, if any.
     */
    getOverrideValue(oid: string, property: string, breakpointId: BreakpointId): string | null {
        const entry = this.overrides.get(oid)?.get(normalizeProperty(property))?.get(breakpointId);
        return entry && entry.type !== StyleChangeType.Remove ? entry.value : null;
    }

    /**
     * Build the full BreakpointMap for an `(oid, property)` pair across all
     * known breakpoints — useful for source-write rebase logic.
     */
    breakpointMapFor(oid: string, property: string): Partial<Record<BreakpointId, string>> {
        const out: Record<string, string> = {};
        const key = normalizeProperty(property);
        // The current responsive translator cannot round-trip a CSS font
        // stack; it emits an invalid `font-Inter, sans-serif` class.
        if (key === 'font-family') return out;
        const bpMap = this.overrides.get(oid)?.get(key);
        if (!bpMap) return out;
        // The current writer accepts plain values and forces `Value` when it
        // rebases. Until it accepts StyleChangeType, a named token must not be
        // rewritten as a computed RGB or an invalid arbitrary class.
        if (
            [...bpMap.values()].some(
                (entry) =>
                    entry.provenance === 'authored' && entry.type === StyleChangeType.Custom,
            )
        ) return out;
        for (const [id, entry] of bpMap) {
            if (entry.provenance === 'authored' && entry.type === StyleChangeType.Value) {
                out[id] = entry.value;
            }
        }
        return out;
    }

    removedBreakpointMapFor(oid: string, property: string): Partial<Record<BreakpointId, string>> {
        const out: Record<string, string> = {};
        const bpMap = this.overrides.get(oid)?.get(normalizeProperty(property));
        if (!bpMap) return out;
        for (const [id, entry] of bpMap) {
            if (entry.provenance === 'authored' && entry.type === StyleChangeType.Remove) {
                out[id] = entry.value;
            }
        }
        return out;
    }

    /**
     * Remove an override for `(oid, property)` at `breakpointId`. The value
     * snaps back to whatever the next-larger defined breakpoint has, or the
     * source-defined base. The action manager runs the same source-write
     * rebase pipeline so the JSX class / overrides.css drops the prefix.
     */
    async clearBreakpointOverride(oid: string, property: string, breakpointId: BreakpointId): Promise<boolean> {
        if (!this.canWriteVisualStyle()) return false;
        const key = normalizeProperty(property);
        const previous = this.overrides.get(oid)?.get(key)?.get(breakpointId);
        if (!previous || previous.type === StyleChangeType.Remove) return false;
        const selected = this.editorEngine.elements.selected.find((element) =>
            element.oid === oid || element.instanceId === oid);
        if (!selected) return false;
        const primary = this.editorEngine.frames.get(selected.frameId);
        const frames = this.editorEngine.frames.getAll().filter((frame) => frame.frame.branchId === selected.branchId);
        const sample = frames.find((frame) => frame.frame.breakpoint?.id === breakpointId);
        if (!sample?.frame.breakpoint || !primary) return false;
        const widths = frames.map((frame) => frame.frame.breakpoint?.width)
            .filter((width): width is number => width !== undefined);
        const context = {
            id: breakpointId,
            name: sample.frame.breakpoint.name ?? breakpointId,
            minWidth: breakpointMinWidth(sample.frame.breakpoint.width, widths.length > 0 ? Math.min(...widths) : null),
        };
        const change = {
            original: { [key]: { value: previous.value, type: previous.type } },
            updated: { [key]: { value: '', type: StyleChangeType.Remove } },
        };
        const targets = this.editorEngine.frames.getByGroupId(primary.frame.groupId)
            .filter((frame) => frame.frame.branchId === selected.branchId)
            .map((frame) => ({
                frameId: frame.frame.id, branchId: selected.branchId,
                domId: selected.domId, oid, change, breakpoint: context,
            }));
        // Source snapshot + preview change enter history together. Nothing in
        // the override map changes until the original-content check succeeds.
        return this.editorEngine.action.resetResponsiveStyle({ type: 'update-style', targets });
    }

    /**
     * Hook surfaced to the action manager — implemented there. Defined here
     * as a slot the StyleManager can call into without circular imports.
     */
    requestSourceRebase: ((oid: string, property: string) => void) | undefined = undefined;

    updateStyleNoAction(styles: CSSProperties, domIds: string[] = []) {
        // Merge into `defined` AND `computed` — every consumer reads
        // `styles.computed[prop]` / `styles.defined[prop]` (useStyleValue,
        // editor-bar hooks, useStyleSetter's same-value short-circuit). A
        // previous version spread the flat CSS keys at the top level next to
        // `defined`/`computed`, so the optimistic mirror was invisible to all
        // readers until the debounced post-edit re-click refreshed selection.
        const flat: Record<string, string> = {};
        for (const [property, value] of Object.entries(styles)) {
            flat[property] = value == null ? '' : String(value);
        }
        const mergeInto = (selectedStyle: SelectedStyle): SelectedStyle => ({
            ...selectedStyle,
            styles: {
                ...selectedStyle.styles,
                defined: { ...selectedStyle.styles.defined, ...flat },
                computed: { ...selectedStyle.styles.computed, ...flat },
            },
        });

        // Same filter semantics as getUpdateStyleAction / recordOverrides:
        // empty list = whole selection, non-empty = only those domIds.
        const filter = domIds.length > 0 ? new Set(domIds) : null;
        for (const [selector, selectedStyle] of this.domIdToStyle.entries()) {
            if (filter && !filter.has(selector)) continue;
            this.domIdToStyle.set(selector, mergeInto(selectedStyle));
        }

        if (this.selectedStyle == null) {
            return;
        }
        if (filter) {
            // `selectedStyle` mirrors the FIRST selected element; only merge
            // when that element is part of the edited subset.
            const primaryDomId = this.editorEngine.elements.selected[0]?.domId;
            if (!primaryDomId || !filter.has(primaryDomId)) {
                return;
            }
        }
        this.selectedStyle = mergeInto(this.selectedStyle);
    }

    private onSelectedElementsChanged(selectedElements: DomElement[]) {
        // Key on frameId + domId: responsive sibling frames share source-derived
        // domIds, so a domId-only key would treat "same element, different
        // frame" as an unchanged selection and skip the override re-seed below.
        const newSelected = selectedElements
            .map((el) => `${el.frameId}:${el.domId}`)
            .toSorted()
            .join();
        const selectionChanged = newSelected !== this.prevSelected;
        if (selectionChanged) {
            this.mode = StyleMode.Root;
        }
        this.prevSelected = newSelected;

        if (selectedElements.length === 0) {
            this.domIdToStyle = new Map();
            return;
        }

        const newMap = new Map<string, SelectedStyle>();
        let newSelectedStyle: SelectedStyle | null = null;
        for (const selectedEl of selectedElements) {
            const selectedStyle: SelectedStyle = {
                styles: selectedEl.styles ?? ({ defined: {}, computed: {} } as DomElementStyles),
                parentRect: selectedEl?.parent?.rect ?? ({} as DOMRect),
                rect: selectedEl?.rect ?? ({} as DOMRect),
            };
            newMap.set(selectedEl.domId, selectedStyle);
            newSelectedStyle ??= selectedStyle;

            // Selecting an element re-syncs the active breakpoint to the frame
            // that element lives in, so subsequent edits scope correctly.
            const frame = this.editorEngine.frames.get(selectedEl.frameId)?.frame;
            if (frame?.breakpoint?.id) {
                this.editorEngine.breakpoints?.setActive(frame.breakpoint.id);
            }
        }
        this.domIdToStyle = newMap;
        this.selectedStyle = newSelectedStyle;

        // Async: pull sibling iframes' computed styles for the same oid into
        // the override map. Non-blocking — the inputs re-render via MobX once
        // seeding lands, so users see "Overridden at Tablet" badges on
        // existing responsive Tailwind classes from prior sessions.
        //
        // Guarded on `selectionChanged`: after every style edit, ActionManager
        // re-clicks the selected element to refresh its rect, which re-fires
        // this reaction with an IDENTICAL selection. Re-seeding then would fan
        // out N penpal round-trips per keystroke (one per sibling frame) for
        // data that hasn't changed — the override map for this oid is already
        // populated and kept current by `recordOverrides`. Only a genuine
        // selection change needs a fresh sibling pull.
        if (selectionChanged) {
            const primary = selectedElements[0];
            if (primary) {
                void this.seedOverridesFromSiblings(primary);
            }
        }
    }

    clear() {
        this.selectedElementsReactionDisposer?.();
        this.selectedElementsReactionDisposer = undefined;
        this.selectedStyle = null;
        this.domIdToStyle = new Map();
        this.prevSelected = '';
        this.mode = StyleMode.Root;
        this.overrides = new Map();
    }
}
