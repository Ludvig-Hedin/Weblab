import { describe, expect, it } from 'bun:test';

import type { DropElementProperties } from '../element';

describe('DropElementProperties.children', () => {
    it('accepts a nested children array', () => {
        const template: DropElementProperties = {
            tagName: 'section',
            styles: { padding: '4rem' },
            textContent: null,
            children: [
                { tagName: 'h1', styles: {}, textContent: 'Title' },
                { tagName: 'p', styles: {}, textContent: 'Body' },
            ],
        };
        expect(template.children).toHaveLength(2);
        expect(template.children![0].tagName).toBe('h1');
    });
});
