import { describe, expect, it } from 'bun:test';
import { assertRetainedReviewMedia, retainedReviewMediaPath, reviewMediaRange, reviewMediaResponse, type RetainedReviewMedia } from './cloudReleaseReviewMedia';

const media: RetainedReviewMedia = { kind: 'imported-retained-media-v1', releaseHash: 'a'.repeat(64),
    hash: 'b'.repeat(64), path: 'public/videos/hero.mp4', bytes: 22_695_161, contentType: 'video/mp4' };
describe('retained review media admission', () => {
    it('binds a finite file to the exact release and decoded public path', () => {
        expect(() => assertRetainedReviewMedia(media, media.releaseHash, ['videos', 'hero.mp4'], '')).not.toThrow();
        for (const change of [{ releaseHash: 'c'.repeat(64) }, { hash: 'invalid' }, { bytes: 0 }, { bytes: 33_554_433 },
            { path: 'public/other.mp4' }, { contentType: 'text/html' }, { extra: true }]) {
            expect(() => assertRetainedReviewMedia({ ...media, ...change }, media.releaseHash, ['videos', 'hero.mp4'], '')).toThrow();
        }
        expect(() => assertRetainedReviewMedia(media, media.releaseHash, ['videos', 'hero.mp4'], '?download=1')).toThrow();
        for (const change of [{ hash: `${media.hash}\n` }, { releaseHash: `${media.releaseHash}\n` },
            { hash: { toString: () => media.hash } }, { hash: null }, { contentType: null, path: 'public/videos/hero.unknown' }]) {
            expect(() => assertRetainedReviewMedia({ ...media, ...change } as unknown as RetainedReviewMedia,
                media.releaseHash, ['videos', change.path ? 'hero.unknown' : 'hero.mp4'], '')).toThrow();
        }
        for (const path of [[], ['..', 'hero.mp4'], ['videos%2fhero.mp4'], ['videos/hero.mp4'], ['_next', 'image'], ['a\\b.mp4'], ['a?b.mp4']]) {
            expect(() => retainedReviewMediaPath(path)).toThrow();
        }
    });
    it('normalizes single ranges and distinguishes invalid syntax from unsatisfied intervals', () => {
        expect(reviewMediaRange(null, 100)).toEqual({ kind: 'full' });
        for (const [header, start, end] of [['bytes=10-19', 10, 19], ['bytes=90-', 90, 99], ['bytes=-5', 95, 99],
            ['bytes=-200', 0, 99], ['bytes=0-200', 0, 99]] as const) {
            expect(reviewMediaRange(header, 100)).toEqual({ kind: 'range', range: { start, end } });
        }
        for (const header of ['bytes=0-1,3-4', 'items=0-1', 'bytes=-', 'bytes=2-1', 'bytes=00-1', 'bytes=9007199254740992-', 'bytes=0-1\n']) {
            expect(reviewMediaRange(header, 100)).toEqual({ kind: 'invalid' });
        }
        for (const header of ['bytes=100-', 'bytes=-0']) expect(reviewMediaRange(header, 100)).toEqual({ kind: 'unsatisfiable' });
    });
    it('accepts only exact successful response metadata', () => {
        const headers = new Headers({ 'content-type': media.contentType, 'content-length': String(media.bytes) });
        const input = { media, method: 'GET', range: null, status: 200, headers };
        expect(reviewMediaResponse(input)).toBe(media.bytes);
        for (const [key, value] of [['content-length', '+22695161'], ['content-length', '22695160'],
            ['content-type', 'text/html'], ['content-encoding', 'gzip'], ['content-range', 'bytes 0-9/22695161'], ['location', '/other']]) {
            const changed = new Headers(headers); changed.set(key!, value!);
            expect(() => reviewMediaResponse({ ...input, headers: changed })).toThrow();
        }
        expect(() => reviewMediaResponse({ ...input, status: 206 })).toThrow();
        const partial = new Headers({ 'content-type': media.contentType, 'content-length': '10', 'content-range': `bytes 5-14/${media.bytes}` });
        expect(reviewMediaResponse({ ...input, range: { start: 5, end: 14 }, status: 206, headers: partial })).toBe(10);
        expect(() => reviewMediaResponse({ ...input, method: 'HEAD', range: { start: 5, end: 14 }, status: 206, headers: partial })).toThrow();
        partial.set('content-range', `bytes 5-14/${media.bytes + 1}`);
        expect(() => reviewMediaResponse({ ...input, range: { start: 5, end: 14 }, status: 206, headers: partial })).toThrow();
    });
});
