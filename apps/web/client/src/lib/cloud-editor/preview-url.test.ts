import { describe, expect, it } from 'bun:test';

import { authenticatedPreviewUrl, previewUrlOnRuntime } from './preview-url';

const now = 1_000_000;
const status = {
    status: 'ready' as const,
    enabled: true,
    previewUrl: 'https://runtime.example',
    previewToken: 'a'.repeat(64),
    expiresAt: now + 1000,
};

describe('private cloud preview URLs', () => {
    it('adds a single in-memory ticket while preserving the exact requested path, query and hash', () => {
        const raw = 'https://runtime.example/products/a%2Fb?term=two%20words&mode=small#details';
        expect(authenticatedPreviewUrl(raw, status, now)).toBe(
            `${raw.split('#')[0]}&__weblab_preview=${status.previewToken}#details`,
        );
        expect(status.previewUrl).toBe('https://runtime.example');
        expect(raw).not.toContain('__weblab_preview');
    });

    it('fails closed for different origins, non-HTTPS URLs, credentials and malformed inputs', () => {
        for (const url of [
            'https://runtime.example.evil/path',
            'https://runtime.example:444/path',
            'http://runtime.example/path',
            'https://user:pass@runtime.example/path',
            '/relative',
            'javascript:alert(1)',
            '',
        ]) {
            expect(authenticatedPreviewUrl(url, status, now)).toBeNull();
        }
        for (const previewUrl of [
            'http://runtime.example',
            'https://user@runtime.example',
            'invalid',
        ]) {
            expect(
                authenticatedPreviewUrl('https://runtime.example/', { ...status, previewUrl }, now),
            ).toBeNull();
        }
    });

    it('fails closed while unavailable or expired, including the exact expiry boundary', () => {
        for (const state of ['stopped', 'error'] as const)
            expect(
                authenticatedPreviewUrl(status.previewUrl, { ...status, status: state }, now),
            ).toBeNull();
        for (const expiresAt of [null, now, now - 1, NaN, Infinity])
            expect(
                authenticatedPreviewUrl(status.previewUrl, { ...status, expiresAt }, now),
            ).toBeNull();
        for (const previewToken of [null, '', 'short', 'z'.repeat(64)])
            expect(
                authenticatedPreviewUrl(status.previewUrl, { ...status, previewToken }, now),
            ).toBeNull();
        expect(
            authenticatedPreviewUrl(status.previewUrl, { ...status, enabled: false }, now),
        ).toBeNull();
        expect(authenticatedPreviewUrl(status.previewUrl, null, now)).toBeNull();
        expect(authenticatedPreviewUrl(status.previewUrl, status, NaN)).toBeNull();
        expect(authenticatedPreviewUrl(status.previewUrl, status, status.expiresAt)).toBeNull();
    });

    it('keeps the same authorized iframe during source updates but not an initial boot', () => {
        const updating = { ...status, status: 'starting' as const };
        expect(authenticatedPreviewUrl(status.previewUrl, updating, now)).toBe(
            authenticatedPreviewUrl(status.previewUrl, status, now),
        );
        expect(authenticatedPreviewUrl(status.previewUrl, { ...updating, previewToken: null }, now)).toBeNull();
        expect(authenticatedPreviewUrl(status.previewUrl, updating, status.expiresAt)).toBeNull();
    });

    it('replaces duplicate stale tickets without forwarding either old value', () => {
        const result = authenticatedPreviewUrl(
            'https://runtime.example/nested?__weblab_preview=old&a=1&__weblab_preview=older',
            status,
            now,
        )!;
        expect(new URL(result).searchParams.getAll('__weblab_preview')).toEqual([
            status.previewToken,
        ]);
        expect(result).not.toContain('old');
        expect(new URL(result).searchParams.get('a')).toBe('1');
    });

    it('preserves saved page paths across runtime replacement before adding the new ticket', () => {
        const original = 'https://old.example/products/a%2Fb?q=two%20words#details';
        expect(authenticatedPreviewUrl(original, status, now)).toBeNull();
        const rebased = previewUrlOnRuntime(original, status.previewUrl);
        expect(rebased).toBe('https://runtime.example/products/a%2Fb?q=two%20words#details');
        expect(authenticatedPreviewUrl(rebased, status, now)).toContain(
            `/products/a%2Fb?q=two%20words&__weblab_preview=${status.previewToken}#details`,
        );
        expect(previewUrlOnRuntime('', status.previewUrl)).toBe('https://runtime.example/');
        expect(previewUrlOnRuntime('http://old.example/a', status.previewUrl)).toBeNull();
        expect(previewUrlOnRuntime(original, 'https://user:pass@runtime.example')).toBeNull();
        expect(
            previewUrlOnRuntime('https://old.example/a?__weblab_preview=old', status.previewUrl),
        ).toBe('https://runtime.example/a');
    });
});
