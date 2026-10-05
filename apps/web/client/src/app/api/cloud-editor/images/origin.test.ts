import { describe, expect, it } from 'bun:test';
import { imageUploadOriginAllowed } from './origin';

describe('image upload origin behind a trusted reverse proxy', () => {
    const site = 'https://editor.example.test';
    const request = (origin?: string, forwarded?: string) => new Request('http://internal:3000/api/cloud-editor/images', {
        method: 'POST', headers: { ...(origin ? { origin } : {}), ...(forwarded ? { 'x-forwarded-host': forwarded } : {}) },
    });
    it('accepts the configured public origin despite internal HTTP transport', () => {
        expect(imageUploadOriginAllowed(request(site), site)).toBe(true);
    });
    it('rejects missing, null, foreign and lookalike origins even with forged forwarding', () => {
        for (const origin of [undefined, 'null', 'https://review.example.test', 'https://editor.example.test.evil.test', 'http://editor.example.test']) {
            expect(imageUploadOriginAllowed(request(origin, 'editor.example.test'), site)).toBe(false);
        }
    });
    it('rejects invalid, credential-bearing and insecure public configuration', () => {
        for (const configured of ['invalid', 'https://user:password@editor.example.test', 'http://editor.example.test', `${site}/path`, `${site}?host=other`, `${site}#fragment`]) {
            expect(imageUploadOriginAllowed(request(site), configured)).toBe(false);
        }
    });
    it('allows explicit local development only at its exact origin and port', () => {
        expect(imageUploadOriginAllowed(request('http://localhost:3000'), 'http://localhost:3000')).toBe(true);
        expect(imageUploadOriginAllowed(request('http://localhost:3001'), 'http://localhost:3000')).toBe(false);
    });
});
