import { describe, expect, it } from 'bun:test';

import { RESERVED_SLUGS, validatePreviewSlug } from './previewSlug';

describe('validatePreviewSlug', () => {
    it('accepts a simple lowercase label', () => {
        const r = validatePreviewSlug('my-site');
        expect(r).toEqual({ ok: true, normalized: 'my-site' });
    });

    it('trims surrounding whitespace and lowercases', () => {
        const r = validatePreviewSlug('  My-Site  ');
        expect(r).toEqual({ ok: true, normalized: 'my-site' });
    });

    it('accepts the minimum length of 3 and a long 48-char label', () => {
        expect(validatePreviewSlug('abc').ok).toBe(true);
        const longSlug = `a${'b'.repeat(46)}c`; // 48 chars
        expect(longSlug.length).toBe(48);
        expect(validatePreviewSlug(longSlug).ok).toBe(true);
    });

    it('accepts interior digits and hyphens', () => {
        expect(validatePreviewSlug('site-2024').ok).toBe(true);
        expect(validatePreviewSlug('a1-b2-c3').ok).toBe(true);
    });

    it('rejects labels that are too short (< 3 chars)', () => {
        expect(validatePreviewSlug('ab').ok).toBe(false);
        expect(validatePreviewSlug('a').ok).toBe(false);
    });

    it('rejects labels longer than 48 chars', () => {
        const tooLong = 'a'.repeat(49);
        expect(validatePreviewSlug(tooLong).ok).toBe(false);
    });

    it('rejects leading or trailing hyphens', () => {
        expect(validatePreviewSlug('-site').ok).toBe(false);
        expect(validatePreviewSlug('site-').ok).toBe(false);
    });

    it('rejects uppercase that does not normalize to a valid label and illegal characters', () => {
        expect(validatePreviewSlug('My Site').ok).toBe(false); // space
        expect(validatePreviewSlug('site_name').ok).toBe(false); // underscore
        expect(validatePreviewSlug('héllo').ok).toBe(false); // non-ascii
        expect(validatePreviewSlug('site.com').ok).toBe(false); // dot
    });

    it('rejects an empty / whitespace-only input', () => {
        expect(validatePreviewSlug('').ok).toBe(false);
        expect(validatePreviewSlug('   ').ok).toBe(false);
    });

    it('rejects every reserved slug', () => {
        for (const reserved of RESERVED_SLUGS) {
            const r = validatePreviewSlug(reserved);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error).toContain('reserved');
        }
    });

    it('returns a format error (not a reserved error) for malformed input', () => {
        const r = validatePreviewSlug('--bad--');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('Subdomain must be');
    });
});
