import type { FrameworkAdapter, FrameworkId } from './types';
import { astroAdapter } from './adapters/astro';
import { nextjsAdapter } from './adapters/nextjs';
import { remixAdapter } from './adapters/remix';
import { staticHtmlAdapter } from './adapters/static-html';
import { tanstackStartAdapter } from './adapters/tanstack-start';
import { viteReactAdapter } from './adapters/vite-react';

/**
 * Registry of all supported framework adapters. New adapters added in later
 * phases register here.
 *
 * Order matters for UI listings — the framework picker renders in this
 * order, with `nextjsAdapter` first as the default. Adapters whose
 * `template.vercelScaffold` is `'pending'` are present so the abstraction is
 * exercised, but the picker UI gates them out via `isFrameworkReady` and the
 * `NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED` feature flag (see
 * `apps/web/client/src/env.ts`).
 */
const ADAPTERS: ReadonlyArray<FrameworkAdapter> = [
    nextjsAdapter,
    viteReactAdapter,
    remixAdapter,
    astroAdapter,
    tanstackStartAdapter,
    staticHtmlAdapter,
];

const ADAPTER_BY_ID = new Map<FrameworkId, FrameworkAdapter>(
    ADAPTERS.map((adapter) => [adapter.id, adapter]),
);

/**
 * Returns the adapter for the given framework id, or the Next.js adapter as
 * a safe fallback. Falling back rather than throwing keeps the editor open
 * for projects whose framework column was written by a future version of
 * the app or has been corrupted.
 */
export function getFrameworkAdapter(id: string | null | undefined): FrameworkAdapter {
    if (!id) return nextjsAdapter;
    return ADAPTER_BY_ID.get(id as FrameworkId) ?? nextjsAdapter;
}

/**
 * The default adapter used when creating a new project without an explicit
 * framework choice (preserves pre-multi-framework behavior).
 */
export const DEFAULT_FRAMEWORK_ADAPTER: FrameworkAdapter = nextjsAdapter;

/**
 * All registered adapters in display order. Use for rendering pickers.
 */
export function listFrameworkAdapters(): ReadonlyArray<FrameworkAdapter> {
    return ADAPTERS;
}

/**
 * True if more than one adapter is registered. Used to decide whether the
 * framework picker UI should render at all (vs. hidden because there's
 * nothing to pick).
 */
export function hasMultipleFrameworks(): boolean {
    return ADAPTERS.length > 1;
}

/**
 * True if the adapter is "production-ready" — a Vercel Sandbox scaffolder
 * has landed for this framework. The picker uses this to hide adapters that
 * are wired up in code but haven't been finished operationally.
 */
export function isFrameworkReady(adapter: FrameworkAdapter): boolean {
    return adapter.template.vercelScaffold !== 'pending';
}

/** Convenience: all adapters whose Vercel scaffolder is implemented. */
export function listReadyFrameworkAdapters(): ReadonlyArray<FrameworkAdapter> {
    return ADAPTERS.filter(isFrameworkReady);
}

/**
 * Try every registered adapter's `validate()` against the given files and
 * return the id of the first one that accepts them. Used by the import flow
 * to auto-pick a framework so users don't have to answer "what are you
 * building?" when we can already tell from the files.
 *
 * Order is the registration order in `ADAPTERS` — Next.js wins ties, then
 * Vite-React, etc., with `static-html` last. That ordering matches the
 * specificity of each adapter's `validate()`: Next.js requires `next` in
 * deps + a router; static-html only requires `index.html`. So a Next.js
 * project (which technically also has html files in a build output) will
 * still be detected as Next.js.
 *
 * Returns `null` when no adapter recognizes the files — the picker should
 * stay visible in that case so the user can choose manually.
 */
export async function detectFrameworkFromFiles(
    files: Parameters<FrameworkAdapter['validate']>[0],
): Promise<FrameworkId | null> {
    for (const adapter of ADAPTERS) {
        try {
            const result = await adapter.validate(files);
            if (result.isValid) return adapter.id;
        } catch {
            // An adapter throwing during validation is treated as "not this
            // one" — keep trying. We don't want a misbehaving adapter to
            // crash detection for the others.
            continue;
        }
    }
    return null;
}
