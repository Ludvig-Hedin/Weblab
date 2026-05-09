import type { StyleChange } from '../style';

export type Change<T> = {
    updated: T;
    original: T;
};

export interface ActionTarget {
    domId: string;
    oid: string | null;
    frameId: string;
    branchId: string;
}

/**
 * Identifies the breakpoint context a style edit was made under (Framer-style
 * responsive editing). `id` is the stable breakpoint identifier (Desktop /
 * Tablet / Phone or a user-defined value); `minWidth` is the resolved
 * min-width threshold used to scope the edit (`@media (min-width: …)` for the
 * HTML path, mapped to `md:`/`lg:`/etc. prefixes for Tailwind).
 *
 * Optional: when omitted, the edit is treated as the project-wide base style.
 */
export interface BreakpointActionContext {
    id: string;
    name: string;
    minWidth: number;
}

export interface StyleActionTarget extends ActionTarget {
    change: Change<Record<string, StyleChange>>;
    breakpoint?: BreakpointActionContext;
}
