// The editor prepares selector queries from source. The preload needs only this
// DOM-independent helper and a callback bound to the selected element.
export type ContextState =
    | 'base'
    | 'hover'
    | 'focus-visible'
    | 'active'
    | 'current:aria'
    | 'current:webflow';
export interface ElementQuery {
    selector: string;
    subject?: string;
    states: Partial<Record<ContextState, boolean | string | null>>;
    needsAriaValue?: Partial<Record<ContextState, boolean>>;
}
export interface ElementContext {
    matches: Partial<Record<ContextState, Record<string, boolean>>>;
    viewportWidth?: number;
}
export function buildElementContext(
    queries: readonly ElementQuery[],
    matches: (selector: string) => boolean | undefined,
    viewportWidth?: number,
): ElementContext {
    const cache = new Map<string, boolean | undefined>();
    function check(selector: string) {
        if (!cache.has(selector)) {
            try {
                cache.set(selector, matches(selector));
            } catch {
                cache.set(selector, undefined);
            }
        }
        return cache.get(selector);
    }
    const context: ElementContext = { matches: {}, viewportWidth };
    for (const query of queries) {
        const excluded = query.subject && check(query.subject) === false;
        for (const state of Object.keys(query.states) as ContextState[]) {
            const test = query.states[state];
            const result = excluded
                ? false
                : query.needsAriaValue?.[state] && check('[aria-current]') !== true
                  ? undefined
                  : typeof test === 'string'
                    ? check(test)
                    : test;
            if (typeof result === 'boolean') {
                const row = (context.matches[state] ??= Object.create(null) as Record<
                    string,
                    boolean
                >);
                row[query.selector] = result;
            }
        }
    }
    return context;
}
