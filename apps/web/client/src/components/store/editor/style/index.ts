import type { CSSProperties } from 'react';
import { makeAutoObservable, reaction } from 'mobx';

import type { BreakpointId, DomElement, DomElementStyles, Font } from '@weblab/models';
import type { StyleChange } from '@weblab/models/style';
import {
    type BreakpointActionContext,
    type Change,
    type StyleActionTarget,
    type UpdateStyleAction,
} from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { convertFontString } from '@weblab/utility';

import type { EditorEngine } from '../engine';

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
 *   oid → property → breakpointId → value
 *
 * The store updates this whenever a `update*` call commits a value, and the
 * style panel reads it to render the override-affordance (subtle blue
 * background + alt-click to clear). Source-write keeps these in sync over
 * iframe reloads.
 */
type OverrideMap = Map<string, Map<string, Map<BreakpointId, string>>>;

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
        // Source-write entry point — the action manager owns the actual write
        // pipeline; we just forward `(oid, property)` so it can re-emit.
        this.requestSourceRebase = (oid, property) => {
            const map = this.breakpointMapFor(oid, property);
            void this.editorEngine.code.writeResponsiveStyle?.({
                oid,
                property,
                valuesByBreakpoint: map,
            });
        };
    }

    updateCustom(style: string, value: string, domIds: string[] = []) {
        const styleObj = { [style]: value };
        const action = this.getUpdateStyleAction(styleObj, domIds, StyleChangeType.Custom);
        this.editorEngine.action.run(action);
        this.updateStyleNoAction(styleObj);
        this.recordOverrides(styleObj);
    }

    update(style: string, value: string) {
        this.updateMultiple({ [style]: value });
    }

    updateMultiple(styles: Record<string, string>) {
        const action = this.getUpdateStyleAction(styles);
        this.editorEngine.action.run(action);
        this.updateStyleNoAction(styles);
        this.recordOverrides(styles);
    }

    updateFontFamily(style: string, value: Font) {
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
        this.editorEngine.action.run(formattedAction);
        // updateStyleNoAction mirrors `selectedStyle.styles` — that map holds
        // resolved CSS values (e.g. "Inter, sans-serif"), not the internal
        // Font id, so callers reading it for display don't get a slug.
        // recordOverrides keeps the id because overrides are keyed by font id.
        this.updateStyleNoAction({ [style]: convertFontString(value.id) });
        this.recordOverrides({ [style]: value.id });
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
        const sample = this.editorEngine.frames.getAll().find((f) => f.frame.breakpoint?.id === id);
        const width =
            sample?.frame.breakpoint?.width ?? this.editorEngine.breakpoints.activeWidth();
        const name = sample?.frame.breakpoint?.name ?? id;
        return { id, name, minWidth: width };
    }

    private recordOverrides(styles: Record<string, unknown>) {
        const breakpointId = this.editorEngine.breakpoints?.activeId ?? 'desktop';
        for (const selectedEl of this.editorEngine.elements.selected) {
            const oid = this.mode === StyleMode.Instance ? selectedEl.instanceId : selectedEl.oid;
            if (!oid) continue;
            const propMap = this.overrides.get(oid) ?? new Map();
            for (const [property, value] of Object.entries(styles)) {
                const bpMap = propMap.get(property) ?? new Map();
                bpMap.set(breakpointId, String(value ?? ''));
                propMap.set(property, bpMap);
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
        const bpMap = this.overrides.get(oid)?.get(property);
        if (!bpMap?.has(breakpointId)) return false;

        const myValue = bpMap.get(breakpointId);
        const myWidth = this.widthForBreakpoint(breakpointId);

        // Find the next-larger breakpoint that has a recorded value.
        let nextLarger: BreakpointId | null = null;
        let nextLargerWidth = Number.POSITIVE_INFINITY;
        for (const id of bpMap.keys()) {
            if (id === breakpointId) continue;
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

        return myValue !== bpMap.get(nextLarger);
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

        // Always seed from the primary's known styles first — guaranteed
        // available because the user just selected this element.
        const propMap = this.overrides.get(oid) ?? new Map<string, Map<BreakpointId, string>>();
        const primaryBp = primary.frame.breakpoint?.id;
        if (primaryBp && selectedEl.styles?.computed) {
            for (const [property, value] of Object.entries(selectedEl.styles.computed)) {
                if (typeof value !== 'string' || !value) continue;
                const bp = propMap.get(property) ?? new Map<BreakpointId, string>();
                bp.set(primaryBp, value);
                propMap.set(property, bp);
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
                        const bp = propMap.get(property) ?? new Map<BreakpointId, string>();
                        bp.set(bpId, value);
                        propMap.set(property, bp);
                    }
                } catch {
                    // Sibling not ready or oid missing — fine.
                }
            });
        await Promise.allSettled(fetches);

        this.overrides.set(oid, propMap);
        // New Map reference so MobX observers re-evaluate.
        this.overrides = new Map(this.overrides);
    }

    /**
     * Get the recorded value for an `(oid, property, breakpoint)` triple, if any.
     */
    getOverrideValue(oid: string, property: string, breakpointId: BreakpointId): string | null {
        return this.overrides.get(oid)?.get(property)?.get(breakpointId) ?? null;
    }

    /**
     * Build the full BreakpointMap for an `(oid, property)` pair across all
     * known breakpoints — useful for source-write rebase logic.
     */
    breakpointMapFor(oid: string, property: string): Record<BreakpointId, string> {
        const out: Record<string, string> = {};
        const bpMap = this.overrides.get(oid)?.get(property);
        if (!bpMap) return out;
        for (const [id, value] of bpMap.entries()) {
            out[id] = value;
        }
        return out;
    }

    /**
     * Remove an override for `(oid, property)` at `breakpointId`. The value
     * snaps back to whatever the next-larger defined breakpoint has, or the
     * source-defined base. The action manager runs the same source-write
     * rebase pipeline so the JSX class / overrides.css drops the prefix.
     */
    clearBreakpointOverride(oid: string, property: string, breakpointId: BreakpointId) {
        const propMap = this.overrides.get(oid);
        const bpMap = propMap?.get(property);
        if (!bpMap?.has(breakpointId)) return;
        bpMap.delete(breakpointId);
        if (bpMap.size === 0) {
            propMap?.delete(property);
        }
        if (propMap?.size === 0) {
            this.overrides.delete(oid);
        }
        this.overrides = new Map(this.overrides);
        // Re-emit the now-truncated map so the iframe injection / source-write
        // drops this breakpoint's rule.
        this.editorEngine.style.requestSourceRebase?.(oid, property);
    }

    /**
     * Hook surfaced to the action manager — implemented there. Defined here
     * as a slot the StyleManager can call into without circular imports.
     */
    requestSourceRebase: ((oid: string, property: string) => void) | undefined = undefined;

    updateStyleNoAction(styles: CSSProperties) {
        for (const [selector, selectedStyle] of this.domIdToStyle.entries()) {
            this.domIdToStyle.set(selector, {
                ...selectedStyle,
                styles: { ...selectedStyle.styles, ...styles },
            });
        }

        if (this.selectedStyle == null) {
            return;
        }
        this.selectedStyle = {
            ...this.selectedStyle,
            styles: { ...this.selectedStyle.styles, ...styles },
        };
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
