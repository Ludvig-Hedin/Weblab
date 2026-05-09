import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '@/env';

/**
 * AES-256-GCM helpers for external CMS source credentials (Payload, Strapi,
 * generic REST API keys / bearer tokens).
 *
 * Format: base64( iv(12) || tag(16) || ciphertext )
 *
 * Key: CMS_SOURCE_ENCRYPTION_KEY — base64-encoded 32 bytes. Generate with
 *   `openssl rand -base64 32`. Rotate by re-encrypting all rows under the new
 *   key; GCM's auth tag will reject the wrong key.
 *
 * Mirrors `provider-tokens.ts` for OAuth tokens — kept separate so the two
 * security perimeters can rotate independently.
 */

function getKey(): Buffer {
    const raw = env.CMS_SOURCE_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            'CMS_SOURCE_ENCRYPTION_KEY is required to handle external CMS source credentials',
        );
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
        throw new Error(`CMS_SOURCE_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
    }
    return buf;
}

/**
 * Encrypt a credentials object. The whole object is JSON-serialized first,
 * then encrypted as a single ciphertext blob — schema is per-adapter so the
 * helper stays type-agnostic.
 */
export function encryptCmsCredentials(credentials: Record<string, unknown>): string {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = JSON.stringify(credentials);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptCmsCredentials(payload: string): Record<string, unknown> {
    const key = getKey();
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 28) {
        throw new Error('Encrypted credentials payload too short');
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Decrypted credentials are not an object');
    }
    return parsed as Record<string, unknown>;
}

/**
 * Source rows store credentials under a stable shape: `{ encrypted: string }`.
 * The Weblab source has empty credentials — we still wrap so the column type
 * stays uniform.
 */
export interface EncryptedCredentialsBlob {
    encrypted: string;
}

export function isEncryptedBlob(value: unknown): value is EncryptedCredentialsBlob {
    return (
        !!value &&
        typeof value === 'object' &&
        'encrypted' in value &&
        typeof (value as { encrypted: unknown }).encrypted === 'string'
    );
}
