import { describe, expect, it } from 'bun:test';

import { isNonEmbeddable } from './project-preview-surface';

describe('isNonEmbeddable', () => {
    it('blocks Vercel Sandbox dev-server URLs (they 502 until the dev server binds)', () => {
        expect(isNonEmbeddable('https://sb-2cn6x2ldrs03.vercel.run')).toBe(true);
        expect(isNonEmbeddable('https://sb-2cn6x2ldrs03.vercel.run/some/path')).toBe(true);
    });

    it('blocks legacy CodeSandbox + Vercel marketing hosts', () => {
        expect(isNonEmbeddable('https://abc123.csb.app')).toBe(true);
        expect(isNonEmbeddable('https://abc.codesandbox.io')).toBe(true);
        expect(isNonEmbeddable('https://vercel.com/x')).toBe(true);
        expect(isNonEmbeddable('https://foo.vercel.com')).toBe(true);
    });

    it('allows a real published site', () => {
        expect(isNonEmbeddable('https://my-cool-site.com')).toBe(false);
        expect(isNonEmbeddable('https://my-site.vercel.app')).toBe(false);
    });

    it('does not throw on a malformed URL', () => {
        expect(isNonEmbeddable('not a url')).toBe(false);
    });
});
