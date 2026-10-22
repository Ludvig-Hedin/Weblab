'use node';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const MAX_CLOUD_IMAGE_INPUT = 4_000_000;
export const MAX_CLOUD_IMAGE_BYTES = 600_000;
export const CLOUD_IMAGE_PIXELS = 16_000_000;
export function imageHash(bytes: ArrayBuffer | Uint8Array | string): string {
    return createHash('sha256').update(typeof bytes === 'string' ? bytes : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)).digest('hex');
}
export function imagePath(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid image hash');
    return `public/weblab-upload-${hash}.webp`;
}
export function imageProof(secret: string, attemptId: string, hash: string): string {
    if (secret.length < 32) throw new Error('Cloud image decoding is unavailable');
    return createHmac('sha256', secret).update(JSON.stringify(['cloud-image-v1', attemptId, hash])).digest('hex');
}
export function validImageProof(secret: string, attemptId: string, hash: string, proof: string): boolean {
    if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(proof)) return false;
    return timingSafeEqual(Buffer.from(imageProof(secret, attemptId, hash), 'hex'), Buffer.from(proof, 'hex'));
}

export type CloudImageMetadataProofInput =
    | { kind: 'upload'; attemptId: string; hash: string; bytes: number; width: number; height: number }
    | { kind: 'approval'; projectId: string; branchId: string; actorId: string; revision: number; path: string;
        hash: string; bytes: number; width: number; height: number };

function metadataProofPayload(input: unknown): string {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid image metadata');
    const value = input as Record<string, unknown>;
    const integer = (number: unknown, max: number): number is number => typeof number === 'number' && Number.isSafeInteger(number) && number > 0 && number <= max;
    const identifier = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && !/[^A-Za-z0-9_:-]/.test(id);
    if (typeof value.hash !== 'string' || value.hash.length !== 64 || /[^a-f0-9]/.test(value.hash) ||
        !integer(value.width, 8192) || !integer(value.height, 8192) || value.width * value.height > CLOUD_IMAGE_PIXELS) throw new Error('Invalid image metadata');
    if (value.kind === 'upload') {
        if (Object.keys(value).length !== 6 || !identifier(value.attemptId) || !integer(value.bytes, MAX_CLOUD_IMAGE_BYTES)) throw new Error('Invalid image metadata');
        return JSON.stringify(['cloud-image-metadata-v2', 'upload', value.attemptId, value.hash, value.bytes, value.width, value.height]);
    }
    if (value.kind !== 'approval' || Object.keys(value).length !== 10 || !identifier(value.projectId) || !identifier(value.branchId) || !identifier(value.actorId) ||
        !integer(value.revision, Number.MAX_SAFE_INTEGER) || !integer(value.bytes, 32 * 1024 * 1024) || typeof value.path !== 'string' || value.path.length > 240 ||
        !value.path.startsWith('public/') || /[\\\u0000-\u001f\u007f-\u009f]/.test(value.path) || value.path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid image metadata');
    // Paths are JSON-escaped, but reject lone surrogates rather than accepting replacement-byte aliases.
    for (let index = 0; index < value.path.length; index++) {
        const code = value.path.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.path.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Invalid image metadata');
        } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('Invalid image metadata');
    }
    return JSON.stringify(['cloud-image-metadata-v2', 'approval', value.projectId, value.branchId, value.actorId,
        value.revision, value.path, value.hash, value.bytes, value.width, value.height]);
}
/** Server-only signature over decoded facts, not a source-edit or approval grant. */
export function imageMetadataProof(secret: string, input: CloudImageMetadataProofInput): string {
    if (secret.length < 32) throw new Error('Cloud image decoding is unavailable');
    return createHmac('sha256', secret).update(metadataProofPayload(input)).digest('hex');
}
export function validImageMetadataProof(secret: string, input: unknown, proof: unknown): boolean {
    if (typeof secret !== 'string' || secret.length < 32 || typeof proof !== 'string' || proof.length !== 64 || /[^a-f0-9]/.test(proof)) return false;
    try {
        const expected = createHmac('sha256', secret).update(metadataProofPayload(input)).digest();
        return timingSafeEqual(expected, Buffer.from(proof, 'hex'));
    } catch { return false; }
}
