import { describe, expect, test } from 'bun:test';

import { countLineChanges, friendlyName, summarizeHandoffFile } from './handoff-summary';

describe('friendlyName', () => {
    test('turns component files into readable names', () => {
        expect(friendlyName('src/components/sections/coverage-stats.tsx')).toBe('Coverage stats');
        expect(friendlyName('src/components/layout/NavBar.tsx')).toBe('Nav bar');
    });

    test('names routes by their folder', () => {
        expect(friendlyName('src/app/page.tsx')).toBe('Home page');
        expect(friendlyName('app/layout.tsx')).toBe('Root layout');
        expect(friendlyName('src/app/(marketing)/about/page.tsx')).toBe('About page');
    });
});

describe('summarizeHandoffFile', () => {
    const base = { path: 'src/hero.tsx', reformatted: false };

    test('detects style-only edits', () => {
        const summary = summarizeHandoffFile({
            ...base,
            original: '<h1 className="text-lg">Hi</h1>',
            updated: '<h1 className="text-xl">Hi</h1>',
        });
        expect(summary.kind).toBe('style');
        expect(summary).toMatchObject({ added: 1, removed: 1 });
    });

    test('detects content edits', () => {
        const summary = summarizeHandoffFile({
            ...base,
            original: '<h1 className="text-lg">Hi</h1>',
            updated: '<h1 className="text-lg">Hello</h1>',
        });
        expect(summary.kind).toBe('content');
    });

    test('flags reformatted and new files', () => {
        expect(
            summarizeHandoffFile({
                ...base,
                original: 'a',
                updated: 'b',
                reformatted: true,
            }).kind,
        ).toBe('structure');
        expect(summarizeHandoffFile({ ...base, original: null, updated: 'a\nb' })).toMatchObject({
            kind: 'added',
            added: 2,
        });
    });
});

test('countLineChanges ignores shared lines', () => {
    expect(countLineChanges('a\nb\nc', 'a\nx\nc')).toEqual({
        added: 1,
        removed: 1,
    });
    expect(countLineChanges('a\nb', 'a\nb\nc')).toEqual({ added: 1, removed: 0 });
});
