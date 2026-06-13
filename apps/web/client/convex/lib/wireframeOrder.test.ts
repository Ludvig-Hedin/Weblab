import { describe, expect, test } from 'bun:test';

import { dedupeSlug, moveInArray, nextOrder, reindex, slugify } from './wireframeOrder';

describe('wireframeOrder helpers', () => {
    test('slugify produces url-safe slugs and never empty', () => {
        expect(slugify('About Us')).toBe('about-us');
        expect(slugify('  Pricing & Plans!! ')).toBe('pricing-plans');
        expect(slugify('---')).toBe('page');
        expect(slugify('')).toBe('page');
    });

    test('dedupeSlug appends suffixes against taken slugs', () => {
        expect(dedupeSlug('home', [])).toBe('home');
        expect(dedupeSlug('home', ['home'])).toBe('home-2');
        expect(dedupeSlug('home', ['home', 'home-2'])).toBe('home-3');
        expect(dedupeSlug('about', ['home'])).toBe('about');
    });

    test('nextOrder returns max+1 or 0', () => {
        expect(nextOrder([])).toBe(0);
        expect(nextOrder([0, 1, 2])).toBe(3);
        expect(nextOrder([5])).toBe(6);
    });

    test('moveInArray moves items immutably and clamps', () => {
        const arr = ['a', 'b', 'c', 'd'];
        expect(moveInArray(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(moveInArray(arr, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
        expect(moveInArray(arr, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
        expect(moveInArray(arr, -1, 0)).toEqual(arr); // no-op on bad index
        expect(arr).toEqual(['a', 'b', 'c', 'd']); // original untouched
    });

    test('reindex compacts to a dense 0..n sequence', () => {
        const items = [{ _id: 'x' }, { _id: 'y' }, { _id: 'z' }];
        expect(reindex(items)).toEqual([
            { id: 'x', order: 0 },
            { id: 'y', order: 1 },
            { id: 'z', order: 2 },
        ]);
    });
});
