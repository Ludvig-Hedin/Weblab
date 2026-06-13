import type { z } from 'zod';

/**
 * The fixed set of section categories the wireframe AI may choose from. Mirrors
 * the spec's block taxonomy. Every registered block belongs to exactly one
 * category; the sitemap's `suggestedBlockType` is coerced onto this set.
 */
export const BLOCK_CATEGORIES = [
    'navbar',
    'hero',
    'logos',
    'feature',
    'split',
    'process',
    'pricing',
    'testimonials',
    'stats',
    'faq',
    'blog',
    'cta',
    'footer',
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export function isBlockCategory(value: string): value is BlockCategory {
    return (BLOCK_CATEGORIES as readonly string[]).includes(value);
}

/** A sibling block in the same category the user can swap to. */
export interface BlockVariant {
    id: string;
    label: string;
}

/**
 * Catalog entry for a single registered block. React-free on purpose so this
 * module is safe to import from the Convex runtime (the generation actions need
 * the ids, categories and content schemas, but never the React renderers).
 */
export interface BlockMeta {
    /** Stable id, e.g. "hero-1". Matches the source filename + emit path. */
    id: string;
    name: string;
    category: BlockCategory;
    tags: string[];
    useCases: string[];
    /** Zod schema for the editable copy/content fields. */
    contentSchema: z.ZodType;
    /** Default content satisfying `contentSchema`; fallback + generation seed. */
    defaultContent: unknown;
}
