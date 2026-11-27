import { describe, expect, test } from 'bun:test';

import { rebaseToMobileFirst } from './responsive-rebase';

describe('responsive source prefixes', () => {
    test('a Tablet-only authored value never becomes an unprefixed base class', () => {
        expect(rebaseToMobileFirst([{ id: 'tablet', minWidth: 768, value: 'green' }])).toEqual([
            { id: 'tablet', minWidth: 768, value: 'green', tailwindPrefix: 'md:' },
        ]);
    });

    test('Phone remains the base when all widths are present', () => {
        expect(
            rebaseToMobileFirst([
                { id: 'desktop', minWidth: 1200, value: 'red' },
                { id: 'phone', minWidth: 390, value: 'blue' },
                { id: 'tablet', minWidth: 768, value: 'green' },
            ]).map(({ tailwindPrefix }) => tailwindPrefix),
        ).toEqual(['', 'md:', 'lg:']);
    });
});

test('exact source scopes ignore unauthored frames below the first edit', () => {
    const entries = [
        { id: 'phone', minWidth: 0, value: undefined },
        { id: 'tablet', minWidth: 780, value: 'brand' },
        { id: 'desktop', minWidth: 1200, value: undefined },
    ];
    expect(rebaseToMobileFirst(entries, { exactThresholds: true })).toEqual([
        { id: 'tablet', minWidth: 780, value: 'brand', tailwindPrefix: '[@media(min-width:780px)]:' },
    ]);
    expect(entries[2]?.value).toBeUndefined();
});
