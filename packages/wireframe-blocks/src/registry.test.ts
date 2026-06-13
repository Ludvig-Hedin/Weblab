import { describe, expect, test } from 'bun:test';

import { BLOCK_RENDERERS } from './browser';
import {
    blockIdsForCategory,
    BLOCKS_META,
    coerceBlockId,
    defaultBlockForCategory,
    getBlockMeta,
    isWireframeBlockId,
    variantsForBlock,
    WIREFRAME_BLOCK_IDS,
} from './meta';
import { BLOCK_CATEGORIES } from './types';

describe('wireframe block registry', () => {
    test('block ids are unique', () => {
        const ids = BLOCKS_META.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(WIREFRAME_BLOCK_IDS).toEqual(ids);
    });

    test('every default content parses against its schema', () => {
        for (const meta of BLOCKS_META) {
            const result = meta.contentSchema.safeParse(meta.defaultContent);
            if (!result.success) {
                throw new Error(`${meta.id} default content failed: ${result.error.message}`);
            }
            expect(result.success).toBe(true);
        }
    });

    test('every spec category has at least one block', () => {
        for (const category of BLOCK_CATEGORIES) {
            expect(blockIdsForCategory(category).length).toBeGreaterThan(0);
        }
    });

    test('every meta block has a matching React renderer', () => {
        for (const meta of BLOCKS_META) {
            expect(typeof BLOCK_RENDERERS[meta.id]).toBe('function');
        }
        // and no orphan renderers
        for (const id of Object.keys(BLOCK_RENDERERS)) {
            expect(isWireframeBlockId(id)).toBe(true);
        }
    });

    test('coerceBlockId never returns an invalid id (no hallucinated blocks)', () => {
        expect(isWireframeBlockId(coerceBlockId('hero-1'))).toBe(true);
        expect(coerceBlockId('hero-1')).toBe('hero-1');
        // category name → category default
        expect(coerceBlockId('hero')).toBe(defaultBlockForCategory('hero'));
        // garbage + category fallback
        expect(isWireframeBlockId(coerceBlockId('totally-made-up', 'cta'))).toBe(true);
        expect(coerceBlockId('totally-made-up', 'cta')).toBe(defaultBlockForCategory('cta'));
        // garbage, no category → safe global default
        expect(isWireframeBlockId(coerceBlockId('totally-made-up'))).toBe(true);
    });

    test('variantsForBlock returns same-category siblings', () => {
        const heroVariants = variantsForBlock('hero-1').map((v) => v.id);
        expect(heroVariants).toContain('hero-1');
        expect(heroVariants).toContain('hero-6');
        for (const v of variantsForBlock('hero-1')) {
            expect(getBlockMeta(v.id)?.category).toBe('hero');
        }
        expect(variantsForBlock('does-not-exist')).toEqual([]);
    });
});
