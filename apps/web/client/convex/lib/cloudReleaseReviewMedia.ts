import { importSourcePath, MAX_IMPORT_ASSET_BYTES } from './cloudImportManifest';

/** Supplied only by the authorized server lookup of an immutable deploy file. */
export type RetainedReviewMedia = {
    kind: 'imported-retained-media-v1'; releaseHash: string; path: string;
    hash: string; bytes: number; contentType: string;
};
const MIME: Readonly<Record<string, string>> = {
    avif: 'image/avif', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};
const fail = (): never => { throw new Error('Invalid retained review media'); };
const hash = (value: unknown) => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);

/** Both the server lookup and proxy use decoded route segments, never an upstream URL. */
export function retainedReviewMediaPath(segments: readonly string[]): string {
    if (!segments.length || segments.some(segment => !segment || segment === '.' || segment === '..' ||
        /[\\/%?#\u0000-\u001f\u007f-\u009f]/.test(segment)) || segments[0] === '_next') fail();
    return importSourcePath(`public/${segments.join('/')}`);
}
export function retainedReviewMediaType(path: string): string | null {
    const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
    return Object.hasOwn(MIME, extension) ? MIME[extension]! : null;
}
export function assertRetainedReviewMedia(value: RetainedReviewMedia, releaseHash: string, segments: readonly string[], search: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'bytes,contentType,hash,kind,path,releaseHash' || search ||
        value.kind !== 'imported-retained-media-v1' || !hash(value.hash) || !hash(value.releaseHash) ||
        value.releaseHash !== releaseHash || value.path !== retainedReviewMediaPath(segments) ||
        !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_IMPORT_ASSET_BYTES ||
        typeof value.contentType !== 'string' || !retainedReviewMediaType(value.path) ||
        value.contentType !== retainedReviewMediaType(value.path)) fail();
}

export type ReviewMediaRange = { start: number; end: number };
export type ReviewMediaRangeResult = { kind: 'full' } | { kind: 'range'; range: ReviewMediaRange } | { kind: 'invalid' | 'unsatisfiable' };
function decimal(value: string): number | null {
    if (!value.length || value.length > 16 || /[^0-9]/.test(value) || (value.length > 1 && value[0] === '0')) return null;
    const number = Number(value); return Number.isSafeInteger(number) ? number : null;
}
export function reviewMediaRange(header: string | null, bytes: number): ReviewMediaRangeResult {
    if (header === null) return { kind: 'full' };
    const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(header);
    if (!match || match[0] !== header || (!match[1] && !match[2])) return { kind: 'invalid' };
    const first = match[1] ? decimal(match[1]) : null, last = match[2] ? decimal(match[2]) : null;
    if ((match[1] && first === null) || (match[2] && last === null)) return { kind: 'invalid' };
    if (first === null) {
        if (last === 0) return { kind: 'unsatisfiable' };
        return { kind: 'range', range: { start: Math.max(0, bytes - last!), end: bytes - 1 } };
    }
    if (last !== null && last < first) return { kind: 'invalid' };
    if (first >= bytes) return { kind: 'unsatisfiable' };
    return { kind: 'range', range: { start: first, end: Math.min(last ?? bytes - 1, bytes - 1) } };
}

/** Validates successful media metadata before exposing any bytes or length header. */
export function reviewMediaResponse(input: {
    media: RetainedReviewMedia; method: string; range: ReviewMediaRange | null;
    status: number; headers: Headers;
}): number {
    const { media, range, headers, status, method } = input;
    const encoding = headers.get('content-encoding');
    if (encoding !== null && encoding !== 'identity') fail();
    if (headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== media.contentType || headers.has('location')) fail();
    const length = decimal(headers.get('content-length') ?? '');
    if (status === 200) {
        if (headers.has('content-range') || length !== media.bytes) fail();
        return media.bytes;
    }
    if (status !== 206 || method !== 'GET' || !range || length !== range.end - range.start + 1 ||
        headers.get('content-range') !== `bytes ${range.start}-${range.end}/${media.bytes}`) fail();
    return length!;
}
