import { type MouseEvent, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Wraps a style input with the "this property is overridden at the active
 * breakpoint" affordance — a subtle blue background plus alt-click to clear
 * the override. The wrapper relies on the StyleManager's per-(oid, property,
 * breakpointId) override map; if no element is selected or no override
 * exists at the active breakpoint, it renders children untouched.
 *
 * Edge cases:
 *   - Multi-select (multiple oids): we use the first selected element's oid
 *     for the override check; the clear-action applies to all selected.
 *   - Active breakpoint changes mid-edit: the wrapper re-reads on every
 *     observer tick, so the visual moves with the user.
 */
export const OverrideAffordance = observer(
    ({
        property,
        children,
    }: {
        /** CSS property key (camelCase, e.g. "paddingTop"). */
        property: string;
        children: ReactNode;
    }) => {
        const editorEngine = useEditorEngine();
        const selected = editorEngine.elements.selected;
        const breakpointId = editorEngine.breakpoints?.activeId;

        const oid = selected[0]?.oid ?? selected[0]?.instanceId ?? null;
        const overridden =
            !!oid &&
            !!breakpointId &&
            editorEngine.style.isOverriddenAt(oid, property, breakpointId);

        const handleClick = (e: MouseEvent<HTMLDivElement>) => {
            // Alt-click clears the override at the active breakpoint. We don't
            // stopPropagation because users may still click the input below
            // for editing — the alt modifier is what gates this behavior.
            if (!e.altKey || !overridden) return;
            e.preventDefault();
            for (const el of selected) {
                const targetOid = el.oid ?? el.instanceId;
                if (!targetOid) continue;
                editorEngine.style.clearBreakpointOverride(targetOid, property, breakpointId);
            }
        };

        return (
            <div
                onClick={handleClick}
                className={
                    overridden
                        ? 'bg-foreground-brand/[0.08] ring-foreground-brand/40 rounded ring-1'
                        : undefined
                }
                title={
                    overridden ? `Overridden at ${breakpointId} · alt-click to reset` : undefined
                }
            >
                {children}
            </div>
        );
    },
);
