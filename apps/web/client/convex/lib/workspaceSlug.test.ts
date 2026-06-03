import { describe, expect, it } from 'bun:test';

import { baseWorkspaceSlug, RESERVED_WORKSPACE_SLUGS } from './workspaceSlug';

describe('baseWorkspaceSlug', () => {
    it('collapses a possessive personal-workspace name (the common case)', () => {
        // "Martin's Workspace" must not become "martin-s-workspace".
        expect(baseWorkspaceSlug("Martin's Workspace")).toBe('martins-workspace');
    });

    it('handles a curly (typographic) apostrophe the same way', () => {
        expect(baseWorkspaceSlug('Bob’s Team')).toBe('bobs-team');
    });

    it('lowercases and collapses punctuation/whitespace runs to single hyphens', () => {
        expect(baseWorkspaceSlug('Acme, Inc.')).toBe('acme-inc');
        expect(baseWorkspaceSlug('  Hello   World  ')).toBe('hello-world');
        expect(baseWorkspaceSlug('site_name')).toBe('site-name');
    });

    it('transliterates accented letters via NFKD (no stray hyphens)', () => {
        expect(baseWorkspaceSlug('Café Studio')).toBe('cafe-studio');
        expect(baseWorkspaceSlug('Jürgen')).toBe('jurgen');
    });

    it('passes an already-clean slug through unchanged', () => {
        expect(baseWorkspaceSlug('already-clean-slug')).toBe('already-clean-slug');
        expect(baseWorkspaceSlug('team-2024')).toBe('team-2024');
    });

    it('caps the base at 48 chars and never leaves a trailing hyphen', () => {
        const out = baseWorkspaceSlug('x'.repeat(60));
        expect(out.length).toBe(48);
        expect(out.endsWith('-')).toBe(false);

        // Slice that would land on a separator must still trim it off.
        const boundary = baseWorkspaceSlug(`${'a'.repeat(47)} ${'b'.repeat(10)}`);
        expect(boundary).toBe('a'.repeat(47));
        expect(boundary.endsWith('-')).toBe(false);
    });

    it('falls back to "workspace" when nothing slug-safe remains or it is too short', () => {
        expect(baseWorkspaceSlug('')).toBe('workspace');
        expect(baseWorkspaceSlug('   ')).toBe('workspace');
        expect(baseWorkspaceSlug('!!!')).toBe('workspace');
        expect(baseWorkspaceSlug('A')).toBe('workspace'); // 1 char < 2-char minimum
    });

    it('always returns a value satisfying the slug column constraints', () => {
        const samples = ["Martin's Workspace", 'Café', 'A', '', '日本語', 'team-2024', '   x   '];
        for (const s of samples) {
            const slug = baseWorkspaceSlug(s);
            expect(slug).toMatch(/^[a-z0-9-]+$/);
            expect(slug.length).toBeGreaterThanOrEqual(2);
            expect(slug.length).toBeLessThanOrEqual(48);
        }
    });

    it('reserves the slugs that would collide with /w/* routes', () => {
        // `new` must be reserved — `/w/new` is a real static route that would
        // shadow a workspace slugged "new".
        expect(RESERVED_WORKSPACE_SLUGS.has('new')).toBe(true);
    });
});
