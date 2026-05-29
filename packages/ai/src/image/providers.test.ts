import { describe, expect, it } from 'bun:test';

import { parseImageDataUrl } from './providers';

describe('parseImageDataUrl', () => {
    it('parses a png base64 data URL', () => {
        const out = parseImageDataUrl('data:image/png;base64,AAAB');
        expect(out).toEqual({ mimeType: 'image/png', base64: 'AAAB' });
    });

    it('parses a jpeg data URL with its mime type', () => {
        const out = parseImageDataUrl('data:image/jpeg;base64,Zm9v');
        expect(out).toEqual({ mimeType: 'image/jpeg', base64: 'Zm9v' });
    });

    it('returns null for hosted http(s) URLs so the caller can fetch them', () => {
        expect(parseImageDataUrl('https://example.com/img.png')).toBeNull();
    });

    it('throws on a data URL that is not base64-encoded', () => {
        expect(() => parseImageDataUrl('data:image/png,not-base64')).toThrow(
            'Malformed base64 image data URL.',
        );
    });

    it('handles base64 payloads containing newlines (dotall match)', () => {
        const out = parseImageDataUrl('data:image/png;base64,AA\nAB');
        expect(out?.base64).toBe('AA\nAB');
    });
});
