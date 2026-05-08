import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '@/env';

/**
 * AES-256-GCM helpers for OAuth tokens stored in `user_provider_connections`.
 *
 * Format: base64( iv(12) || tag(16) || ciphertext )
 *
 * Key: PROVIDER_TOKEN_ENCRYPTION_KEY — base64-encoded 32 bytes. Generate with
 *   `openssl rand -base64 32`. Rotate by re-encrypting all rows under the new
 *   key (a future migration helper); GCM's auth tag will reject the wrong key.
 */

function getKey(): Buffer {
    const raw = env.PROVIDER_TOKEN_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            'PROVIDER_TOKEN_ENCRYPTION_KEY is required to handle provider OAuth tokens',
        );
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
        throw new Error(
            `PROVIDER_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`,
        );
    }
    return buf;
}

export function encryptProviderToken(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptProviderToken(payload: string): string {
    const key = getKey();
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 28) {
        throw new Error('Encrypted token payload too short');
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
}
