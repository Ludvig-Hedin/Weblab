import { afterEach, describe, expect, test } from 'bun:test';

import { deleteImage, getImage, putImage } from '../../src/image/cache';

const SAMPLE_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('image cache', () => {
    const writtenIds: string[] = [];

    afterEach(() => {
        for (const id of writtenIds.splice(0)) {
            deleteImage(id);
        }
    });

    test('roundtrips an image for the owning user', () => {
        const id = putImage(SAMPLE_B64, 'image/png', 'user-1');
        writtenIds.push(id);
        const got = getImage(id, 'user-1');
        expect(got).not.toBeNull();
        expect(got!.b64).toBe(SAMPLE_B64);
        expect(got!.mimeType).toBe('image/png');
    });

    test('returns null for a different user (per-user isolation)', () => {
        const id = putImage(SAMPLE_B64, 'image/png', 'user-1');
        writtenIds.push(id);
        expect(getImage(id, 'user-2')).toBeNull();
    });

    test('returns null when the id does not exist', () => {
        expect(getImage('does-not-exist', 'user-1')).toBeNull();
    });

    test('returns null when userId is empty', () => {
        const id = putImage(SAMPLE_B64, 'image/png', 'user-1');
        writtenIds.push(id);
        expect(getImage(id, '')).toBeNull();
    });

    test('strips data URL prefix on put', () => {
        const dataUrl = `data:image/png;base64,${SAMPLE_B64}`;
        const id = putImage(dataUrl, 'image/png', 'user-1');
        writtenIds.push(id);
        const got = getImage(id, 'user-1');
        expect(got!.b64).toBe(SAMPLE_B64);
    });

    test('throws when userId is omitted', () => {
        expect(() => putImage(SAMPLE_B64, 'image/png', '')).toThrow(/userId/);
    });

    test('two puts produce distinct ids', () => {
        const a = putImage(SAMPLE_B64, 'image/png', 'user-1');
        const b = putImage(SAMPLE_B64, 'image/png', 'user-1');
        writtenIds.push(a, b);
        expect(a).not.toBe(b);
    });

    test('deleteImage removes the entry', () => {
        const id = putImage(SAMPLE_B64, 'image/png', 'user-1');
        expect(deleteImage(id)).toBe(true);
        expect(getImage(id, 'user-1')).toBeNull();
    });
});
