import { describe, expect, it } from 'bun:test';

import {
    RESERVED_SLUGS,
    slugFromNameForSubdomain,
    SUBDOMAIN_SLUG_RE,
    validatePreviewSlug,
} from './previewSlug';

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

describe('slugFromNameForSubdomain', () => {
    it('derives a clean label from a project name', () => {
        expect(slugFromNameForSubdomain('My Portfolio')).toBe('my-portfolio');
        expect(slugFromNameForSubdomain('Acme, Inc.')).toBe('acme-inc');
        expect(slugFromNameForSubdomain('Café')).toBe('cafe');
    });

    it('caps at 48 chars without a trailing hyphen', () => {
        const out = slugFromNameForSubdomain('x'.repeat(60));
        expect(out).not.toBeNull();
        expect(out!.length).toBe(48);
        expect(out!.endsWith('-')).toBe(false);
    });

    it('returns null when the name is too short to be a valid subdomain', () => {
        // SUBDOMAIN_SLUG_RE requires >= 3 chars; the caller then uses the
        // id-based fallback.
        expect(slugFromNameForSubdomain('AB')).toBeNull();
        expect(slugFromNameForSubdomain('a')).toBeNull();
    });

    it('returns null when nothing slug-safe remains', () => {
        expect(slugFromNameForSubdomain('')).toBeNull();
        expect(slugFromNameForSubdomain('   ')).toBeNull();
        expect(slugFromNameForSubdomain('日本語')).toBeNull();
    });

    it('returns null for a reserved label so it is never auto-assigned', () => {
        expect(slugFromNameForSubdomain('API')).toBeNull();
        expect(slugFromNameForSubdomain('www')).toBeNull();
    });

    it('only ever returns labels that pass the canonical subdomain regex', () => {
        for (const name of ['My Site', 'a-b-c', 'Project 2024', 'Hello World!!!']) {
            const slug = slugFromNameForSubdomain(name);
            if (slug !== null) expect(SUBDOMAIN_SLUG_RE.test(slug)).toBe(true);
        }
    });
});
