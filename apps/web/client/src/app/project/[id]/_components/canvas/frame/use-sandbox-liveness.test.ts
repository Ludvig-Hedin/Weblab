import { describe, expect, it } from 'bun:test';

import { isLocalPreviewUrl } from './use-sandbox-liveness';

describe('isLocalPreviewUrl', () => {
    it('treats desktop local dev-server URLs as local', () => {
        expect(isLocalPreviewUrl('http://localhost:3000')).toBe(true);
        expect(isLocalPreviewUrl('http://localhost:5173/')).toBe(true);
        expect(isLocalPreviewUrl('http://127.0.0.1:8080')).toBe(true);
        expect(isLocalPreviewUrl('http://0.0.0.0:3000')).toBe(true);
    });

    it('treats Vercel/CodeSandbox cloud URLs as NOT local', () => {
        // These must keep using the server-side Convex liveness probe.
        expect(isLocalPreviewUrl('https://abc123.vercel.run')).toBe(false);
        expect(isLocalPreviewUrl('https://xzsy8c-3000.csb.app')).toBe(false);
        expect(isLocalPreviewUrl('https://example.com')).toBe(false);
    });

    it('is not fooled by hostnames that merely contain "localhost"', () => {
        expect(isLocalPreviewUrl('https://localhost.evil.com')).toBe(false);
        expect(isLocalPreviewUrl('https://notlocalhost:3000')).toBe(false);
    });

    it('returns false for empty or malformed URLs (provisioning / no frame yet)', () => {
        expect(isLocalPreviewUrl('')).toBe(false);
        expect(isLocalPreviewUrl('not-a-url')).toBe(false);
        expect(isLocalPreviewUrl('localhost:3000')).toBe(false); // no protocol → not a valid URL
    });
});
