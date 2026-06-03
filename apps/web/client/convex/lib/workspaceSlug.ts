// Human-readable workspace URL slugs.
//
// The slug is the `/w/<slug>` path segment. It used to be `personal-<userId>`
// for personal workspaces (opaque, ugly) and `<name>-<userId.slice(0,6)>` for
// teams. We now derive every slug from the workspace NAME (Webflow/Framer style)
// with a numeric `-2`, `-3`… suffix only on collision.
//
// The pure `baseWorkspaceSlug` is kept ctx-free so the format rules can be
// unit-tested with bun:test (the repo's CI runner) without a convex-test
// harness. `generateUniqueWorkspaceSlug` composes it with `ctx.db` uniqueness
// checks — mirrors the `previewSlug.ts` split.

import type { MutationCtx, QueryCtx } from '../_generated/server';

// Labels we never hand out as a workspace slug:
//  - `new` is a real sibling route (`/w/new`) and a static segment shadows the
//    dynamic `[slug]` — a workspace slugged `new` would be unreachable.
//  - the rest are defensive reservations against future `/w/*` routes and
//    obvious confusables.
export const RESERVED_WORKSPACE_SLUGS = new Set<string>([
    'new',
    'settings',
    'projects',
    'admin',
    'api',
    'w',
]);

// Slug column constraints enforced by `workspaces.update` / `createTeam`:
// `^[a-z0-9-]+$`, length 2–64. `baseWorkspaceSlug` always returns a value that
// satisfies them.
const MAX_BASE_LEN = 48; // leaves room for a `-NNN` collision suffix within 64
const FALLBACK = 'workspace';

// U+0300–U+036F: combining diacritical marks left behind by NFKD.
const COMBINING_MIN = 0x300;
const COMBINING_MAX = 0x36f;
// Apostrophes (ASCII + curly) — stripped so a possessive collapses into the
// preceding word ("bob's" → "bobs", not "bob-s").
const APOSTROPHES = new Set(["'", '‘', '’']);

/**
 * Normalize a workspace name into a clean URL slug.
 * "Martin's Workspace" → "martins-workspace"; "Acme, Inc." → "acme-inc";
 * "Café Studio" → "cafe-studio"; "Jürgen" → "jurgen".
 * Returns `"workspace"` when the name has no slug-safe characters (or is too
 * short to satisfy the 2-char minimum).
 */
export function baseWorkspaceSlug(name: string): string {
    // NFKD splits accented letters into base + combining mark; we keep the base
    // letter and drop the mark (so interior accents like "Jürgen" → "jurgen"
    // rather than "ju-rgen"). Iterating by code point handles surrogate pairs.
    const decomposed = name.toLowerCase().normalize('NFKD');
    let cleaned = '';
    for (const ch of decomposed) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp >= COMBINING_MIN && cp <= COMBINING_MAX) continue;
        if (APOSTROPHES.has(ch)) continue;
        cleaned += ch;
    }
    const base = cleaned
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_BASE_LEN)
        // A trailing hyphen can reappear if the slice landed mid-separator.
        .replace(/-+$/g, '');
    return base.length >= 2 ? base : FALLBACK;
}

async function slugIsAvailable(ctx: QueryCtx | MutationCtx, slug: string): Promise<boolean> {
    if (RESERVED_WORKSPACE_SLUGS.has(slug)) return false;
    // `.first()` not `.unique()`: by_slug is a plain index, not a DB-level unique
    // constraint, so a (transient) duplicate must not throw the generator.
    const hit = await ctx.db
        .query('workspaces')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .first();
    return hit === null;
}

/**
 * Derive a unique, human-readable slug from a workspace name. Appends `-2`,
 * `-3`… until a free label is found. Must run inside a mutation so the
 * availability check and the subsequent insert share one serializable
 * transaction (Convex OCC re-runs the handler on conflict, so two racing
 * creates can't both win the same slug).
 */
export async function generateUniqueWorkspaceSlug(
    ctx: MutationCtx,
    name: string,
): Promise<string> {
    const base = baseWorkspaceSlug(name);
    if (await slugIsAvailable(ctx, base)) return base;
    for (let n = 2; n < 1000; n++) {
        // Trim the base so `base-NNN` stays within the 64-char column limit.
        const suffix = `-${n}`;
        const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
        if (await slugIsAvailable(ctx, candidate)) return candidate;
    }
    // Pathological fallback (1000 collisions on one base): append a timestamp.
    // Date.now() is permitted in Convex mutations.
    const tail = `-${Date.now().toString(36)}`;
    return `${base.slice(0, 64 - tail.length)}${tail}`;
}
