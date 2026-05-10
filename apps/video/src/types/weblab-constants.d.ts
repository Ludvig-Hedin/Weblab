/**
 * Type declaration for `@weblab/constants` scoped to the symbols this
 * Remotion workspace consumes. The runtime value still comes from the
 * shared package (`packages/constants/src/editor.ts`, the single source
 * of truth) — Bun resolves the bare specifier at run time. tsc resolves
 * via the path mapping in `tsconfig.json` so it does not descend into
 * the full constants graph and pull in unrelated cross-version React
 * types from sibling workspaces.
 *
 * If you need additional constants here, ADD the symbol to this file —
 * never hardcode brand strings inline.
 */
export const APP_NAME: string;
export const APP_DOMAIN: string;
