import { describe, expect, it } from 'bun:test';

import {
    CLOUD_PILOT_TAG,
    CLOUD_PILOT_TEMPLATE,
    initialPilotContent,
    isCloudPilotProject,
    isPublicHttpsUrl,
    readPilotMetadata,
    validatePilotContent,
} from './cloudPilot';

describe('cloud pilot content boundary', () => {
    it('accepts the fixed template content, including literal text', () => {
        const content = {
            ...initialPilotContent('Welcome {customerName}'),
            description: '<script>literal text</script>',
            imageUrl: 'https://images.example.com/photo.jpg',
            imageAlt: 'Studio',
            ctaLabel: 'Visit',
            ctaHref: 'https://example.com/contact',
            alignment: 'center',
        };
        expect(validatePilotContent(content)).toEqual(content);
    });

    it('rejects unknown fields, missing fields, unsupported alignment and oversized text', () => {
        const content = initialPilotContent('Studio');
        for (const invalid of [
            null,
            [],
            { ...content, customCode: '<script />' },
            { ...content, title: undefined },
            { ...content, title: '  ' },
            { ...content, alignment: 'right' },
            { ...content, description: 'x'.repeat(2001) },
        ])
            expect(() => validatePilotContent(invalid)).toThrow('PILOT_INVALID_CONTENT');
    });

    it('requires an image description and a complete call to action', () => {
        const content = initialPilotContent('Studio');
        expect(() =>
            validatePilotContent({
                ...content,
                imageUrl: 'https://example.com/a.jpg',
            }),
        ).toThrow('PILOT_INVALID_IMAGE');
        for (const invalid of [
            { ...content, ctaLabel: 'Go' },
            { ...content, ctaHref: 'https://example.com' },
            { ...content, ctaLabel: 'Go', ctaHref: 'javascript:alert(1)' },
        ])
            expect(() => validatePilotContent(invalid)).toThrow('PILOT_INVALID_LINK');
    });

    it('rejects credentials, code URLs, local hosts, IP literals and nonstandard ports', () => {
        for (const url of [
            'javascript:alert(1)',
            'data:image/png;base64,AA',
            'http://example.com',
            'https://user:secret@example.com',
            'https://localhost',
            'https://host.localhost',
            'https://host.local',
            'https://host.internal',
            'https://host.test',
            'https://127.0.0.1',
            'https://[::1]',
            'https://example.com:8443',
            '/contact',
        ])
            expect(isPublicHttpsUrl(url)).toBe(false);
        expect(isPublicHttpsUrl('https://example.com:443/contact?q=studio#details')).toBe(true);
    });
});

describe('cloud pilot routing metadata', () => {
    it('recognizes damaged pilots so they cannot fall through to the legacy editor', () => {
        expect(isCloudPilotProject({ tags: [CLOUD_PILOT_TAG], runtimeMetadata: null })).toBe(true);
        expect(isCloudPilotProject({ tags: [], runtimeMetadata: { cloudPilot: null } })).toBe(true);
        expect(isCloudPilotProject({ tags: [], runtimeMetadata: {} })).toBe(false);
    });

    it('accepts only the supported template with a nonempty content reference', () => {
        expect(
            readPilotMetadata({
                cloudPilot: { template: CLOUD_PILOT_TEMPLATE, itemId: 'item' },
            }),
        ).toEqual({ template: CLOUD_PILOT_TEMPLATE, itemId: 'item' });
        for (const metadata of [
            null,
            {},
            { cloudPilot: null },
            { cloudPilot: { template: 'future-template', itemId: 'item' } },
            { cloudPilot: { template: CLOUD_PILOT_TEMPLATE, itemId: '' } },
        ])
            expect(() => readPilotMetadata(metadata)).toThrow('PILOT_UNSUPPORTED');
    });
});
