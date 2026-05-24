'use node';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM helpers for external CMS source credentials. Mirrors
// apps/web/client/src/server/utils/cms-credentials.ts byte-for-byte so
// rows encrypted in the tRPC era decrypt cleanly under Convex.
//
// Format: base64( iv(12) || tag(16) || ciphertext )
// Key:    CMS_SOURCE_ENCRYPTION_KEY — base64-encoded 32 bytes (Node env).
//
// MUST be called from `"use node"` files only (action handlers, lib code
// re-imported by those handlers). Convex's default V8 runtime has no
// node:crypto.

function getKey(): Buffer {
    const raw = process.env.CMS_SOURCE_ENCRYPTION_KEY;
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
