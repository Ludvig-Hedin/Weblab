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
