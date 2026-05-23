import { makeAutoObservable, reaction } from 'mobx';

import type { EditorEngine } from '../engine';

/**
 * Where a CSS property's value should be written when a control commits a change.
 *
 * - `tailwind`: emit/strip a Tailwind utility class on the element's `className`.
 *   Falls back to `inline` automatically when no Tailwind equivalent exists.
 * - `custom-class`: append/replace the rule on a user-named class in the project's
 *   stylesheet (routed through the parser).
 * - `inline`: write directly to the element's `style` attribute. Highest specificity
 *   short of `!important`; required when the user has enabled "override" for this
 *   property on this element.
 */
export type WriteTarget = 'tailwind' | 'custom-class' | 'inline';

export const ALL_WRITE_TARGETS: readonly WriteTarget[] = [
    'tailwind',
    'custom-class',
    'inline',
] as const;

/**
 * Per-project, persisted preferences for how the new Style panel writes values.
 *
 * Stored in `localStorage` under a key namespaced by the editor engine's `projectId`
 * so different projects can use different defaults (e.g. a Tailwind project vs an
 * HTML-only project).
 */
export class StylePreferencesStore {
    /** Project-level default. */
    defaultWriteTarget: WriteTarget = 'tailwind';
    /** Per-property override of the default (e.g. user prefers inline for `transform`). */
    writeTargetByProperty: Record<string, WriteTarget> = {};
    /** Element OID -> set of property names that must be written inline only. */
    overrideByElement: Record<string, Set<string>> = {};

    private hydrated = false;
    private persistDisposer?: () => void;

    // Getter rather than an eagerly-assigned field so that it reads
    // editorEngine.projectId lazily. StylePreferencesStore is constructed as a
    // class field initializer on EditorEngine — before the EditorEngine
    // constructor body runs and assigns `this.projectId`. Accessing projectId
    // in the constructor would always yield undefined.
    private get storageKey(): string {
        return `weblab:style-preferences:${this.editorEngine.projectId}`;
    }

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    init() {
        if (!this.editorEngine.projectId) {
            console.warn(
                'StylePreferencesStore: projectId is missing, preferences will not be persisted correctly',
            );
        }
        this.hydrate();
        // Persist whenever a tracked field changes. We serialize once per microtask.
        let queued = false;
        this.persistDisposer = reaction(
            () => this.serialize(),
            () => {
                if (queued) return;
                queued = true;
                queueMicrotask(() => {
                    queued = false;
                    this.persist();
                });
            },
        );
    }

    /** Effective write target for a given CSS property. */
    getWriteTarget(property: string): WriteTarget {
        return this.writeTargetByProperty[property] ?? this.defaultWriteTarget;
    }

    setDefaultWriteTarget(target: WriteTarget) {
        this.defaultWriteTarget = target;
    }

    setWriteTarget(property: string, target: WriteTarget | null) {
        if (target === null) {
            const next = { ...this.writeTargetByProperty };
            delete next[property];
            this.writeTargetByProperty = next;
            return;
        }
        this.writeTargetByProperty = {
            ...this.writeTargetByProperty,
            [property]: target,
        };
    }

    /** True if the user has forced inline writes for this property on this element. */
    isOverridden(oid: string | null | undefined, property: string): boolean {
        if (!oid) return false;
        return this.overrideByElement[oid]?.has(property) ?? false;
    }

    setOverride(oid: string, property: string, override: boolean) {
        const current = this.overrideByElement[oid] ?? new Set<string>();
        const next = new Set(current);
        if (override) {
            next.add(property);
        } else {
            next.delete(property);
        }
        this.overrideByElement = {
            ...this.overrideByElement,
            [oid]: next,
        };
    }

    clear() {
        this.persistDisposer?.();
        this.persistDisposer = undefined;
        this.defaultWriteTarget = 'tailwind';
        this.writeTargetByProperty = {};
        this.overrideByElement = {};
        this.hydrated = false;
    }

    // ----- Serialization -----

    private serialize() {
        return {
            defaultWriteTarget: this.defaultWriteTarget,
            writeTargetByProperty: this.writeTargetByProperty,
            overrideByElement: Object.fromEntries(
                Object.entries(this.overrideByElement).map(([oid, set]) => [oid, [...set]]),
            ),
        };
    }

    private hydrate() {
        if (this.hydrated || typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (!raw) {
                this.hydrated = true;
                return;
            }
            const parsed = JSON.parse(raw) as Partial<ReturnType<typeof this.serialize>>;
            if (
                parsed.defaultWriteTarget &&
                ALL_WRITE_TARGETS.includes(parsed.defaultWriteTarget)
            ) {
                this.defaultWriteTarget = parsed.defaultWriteTarget;
            }
            if (parsed.writeTargetByProperty) {
                this.writeTargetByProperty = Object.fromEntries(
                    Object.entries(parsed.writeTargetByProperty).filter(([, target]) =>
                        ALL_WRITE_TARGETS.includes(target),
                    ),
                ) as Record<string, WriteTarget>;
            }
            if (parsed.overrideByElement) {
                this.overrideByElement = Object.fromEntries(
                    Object.entries(parsed.overrideByElement).map(([oid, props]) => [
                        oid,
                        new Set(Array.isArray(props) ? props : []),
                    ]),
                );
            }
        } catch {
            // Corrupt storage — start fresh, leave defaults.
        }
        this.hydrated = true;
    }

    private persist() {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(this.storageKey, JSON.stringify(this.serialize()));
        } catch {
            // Quota / private mode — silently ignore.
        }
    }
}
