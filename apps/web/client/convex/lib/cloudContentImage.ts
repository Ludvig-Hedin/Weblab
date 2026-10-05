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
