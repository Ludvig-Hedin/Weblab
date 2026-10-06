import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { openRegisteredReleaseCredential, openReleaseCredential, sealReleaseCredential, type ReleaseCredentialBinding } from './cloudReleaseCredentialEnvelope';
import { decryptProviderToken, encryptProviderToken } from './providerTokens';

const originalKey = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
beforeEach(() => { process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64'); });
afterEach(() => {
    if (originalKey === undefined) delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
    else process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = originalKey;
});
const binding: ReleaseCredentialBinding = {
    destinationId: 'destination_123', workspaceId: 'workspace_123', projectId: 'project_123', branchId: 'branch_123',
    teamId: 'team_ew', providerProjectId: 'prj_site', hostname: 'ew-site.vercel.app', version: 1,
};
const credentials = { token: 'private-provider-token', bypass: 'private-review-bypass' };
const errorCode = 'CLOUD_RELEASE_CREDENTIAL_INVALID';
function sealedCiphertext(ciphertext: string) {
    return { ciphertext, ciphertextHash: createHash('sha256').update(ciphertext).digest('hex') };
}
function plaintextEnvelope(value: unknown) {
    return sealedCiphertext(encryptProviderToken(JSON.stringify(value)));
}

describe('cloud release credential envelopes', () => {
    const imported: ReleaseCredentialBinding = { ...binding, hostingProfile: 'imported-next-hosting-v1' };
    it('binds imported credentials to canonical envelope2 and cannot cross the starter boundary', () => {
        const sealed = sealReleaseCredential(imported, credentials);
        expect(decryptProviderToken(sealed.ciphertext)).toBe(JSON.stringify({ envelopeVersion: 2, ...imported, ...credentials }));
        expect(openReleaseCredential(imported, sealed)).toEqual(credentials);
        expect(openRegisteredReleaseCredential({ ...imported, ...sealed })).toEqual(credentials);
        expect(() => openReleaseCredential(binding, sealed)).toThrow(errorCode);
        expect(() => openReleaseCredential(imported, sealReleaseCredential(binding, credentials))).toThrow(errorCode);
        expect(() => openRegisteredReleaseCredential({ ...binding, ...sealed })).toThrow(errorCode);
    });
    it('refuses imported noncanonical plaintext, duplicate keys and altered profile/version', () => {
        const canonical = decryptProviderToken(sealReleaseCredential(imported, credentials).ciphertext);
        const envelope = JSON.parse(canonical) as Record<string, unknown>;
        for (const plaintext of [canonical + '\n', JSON.stringify(Object.fromEntries(Object.entries(envelope).reverse())),
            canonical.replace('"envelopeVersion":2', '"envelopeVersion":2,"envelopeVersion":2'),
            JSON.stringify({ ...envelope, envelopeVersion: 1 }), JSON.stringify({ ...envelope, hostingProfile: 'cloud-studio-v1' })]) {
            expect(() => openReleaseCredential(imported, sealedCiphertext(encryptProviderToken(plaintext)))).toThrow(errorCode);
        }
        for (const [, patch] of changedBindings) {
            expect(() => openReleaseCredential({ ...imported, ...patch }, sealReleaseCredential(imported, credentials))).toThrow(errorCode);
        }
    });
    it('preserves legacy noncanonical object-order acceptance without admitting imported fields', () => {
        expect(openReleaseCredential(binding, plaintextEnvelope({ ...credentials, ...binding, envelopeVersion: 1 }))).toEqual(credentials);
        expect(() => sealReleaseCredential({ ...binding, hostingProfile: undefined }, credentials)).toThrow(errorCode);
    });
    it('round-trips only the exact binding and uses a fresh encrypted generation', () => {
        const sealed = sealReleaseCredential(binding, credentials);
        expect(openReleaseCredential(binding, sealed)).toEqual(credentials);
        expect(sealed.ciphertextHash).toMatch(/^[a-f0-9]{64}$/);
        expect(sealed).not.toEqual(sealReleaseCredential(binding, credentials));
        expect(decryptProviderToken(sealed.ciphertext)).toBe(JSON.stringify({ envelopeVersion: 1, ...binding, ...credentials }));
    });

    const changedBindings: Array<[string, Partial<ReleaseCredentialBinding>]> = [
        ['destination', { destinationId: 'destination_other' }],
        ['workspace', { workspaceId: 'workspace_other' }],
        ['project', { projectId: 'project_other' }],
        ['branch', { branchId: 'branch_other' }],
        ['account', { teamId: 'team_other' }],
        ['provider project', { providerProjectId: 'prj_other' }],
        ['hostname', { hostname: 'other-site.vercel.app' }],
        ['credential version', { version: 2 }],
    ];
    for (const [name, patch] of changedBindings) {
        it(`rejects a credential swapped across ${name}`, () => {
            const sealed = sealReleaseCredential(binding, credentials);
            expect(() => openReleaseCredential({ ...binding, ...patch }, sealed)).toThrow(errorCode);
        });
    }
    it('refuses hash mismatch, tampering with a recomputed hash, and noncanonical ciphertext', () => {
        const sealed = sealReleaseCredential(binding, credentials);
        expect(() => openReleaseCredential(binding, { ...sealed, ciphertextHash: '0'.repeat(64) })).toThrow(errorCode);
        const bytes = Buffer.from(sealed.ciphertext, 'base64');
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
        expect(() => openReleaseCredential(binding, sealedCiphertext(bytes.toString('base64')))).toThrow(errorCode);
        expect(() => openReleaseCredential(binding, sealedCiphertext(`${sealed.ciphertext}\n`))).toThrow(errorCode);
    });
    it('hides wrong-key and missing-key failures behind the fixed error', () => {
        const sealed = sealReleaseCredential(binding, credentials);
        process.env.PROVIDER_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
        expect(() => openReleaseCredential(binding, sealed)).toThrow(errorCode);
        delete process.env.PROVIDER_TOKEN_ENCRYPTION_KEY;
        expect(() => sealReleaseCredential(binding, credentials)).toThrow(errorCode);
        expect(() => openReleaseCredential(binding, sealed)).toThrow(errorCode);
    });
    const validPlaintext = { envelopeVersion: 1, ...binding, ...credentials };
    const malformed: Array<[string, unknown]> = [
        ['null', null], ['array', [validPlaintext]], ['missing fields', { token: credentials.token }],
        ['extra field', { ...validPlaintext, other: 'not allowed' }],
        ['wrong schema version', { ...validPlaintext, envelopeVersion: 2 }],
        ['wrong version type', { ...validPlaintext, version: '1' }],
        ['wrong binding type', { ...validPlaintext, branchId: 123 }],
        ['wrong token type', { ...validPlaintext, token: 123 }],
        ['empty bypass', { ...validPlaintext, bypass: '' }],
        ['newline bypass', { ...validPlaintext, bypass: 'private\nheader' }],
        ['oversized token', { ...validPlaintext, token: 'a'.repeat(4097) }],
    ];
    for (const [name, value] of malformed) {
        it(`rejects encrypted ${name} without echoing plaintext`, () => {
            expect(() => openReleaseCredential(binding, plaintextEnvelope(value))).toThrow(new Error(errorCode));
        });
    }
    it('rejects encrypted invalid JSON', () => {
        expect(() => openReleaseCredential(binding, sealedCiphertext(encryptProviderToken('private invalid plaintext')))).toThrow(new Error(errorCode));
    });
    for (const secret of ['', '   ', 'header\rvalue', 'header\nvalue', 'a'.repeat(4097)]) {
        it(`refuses invalid secret input of length ${secret.length}`, () => {
            expect(() => sealReleaseCredential(binding, { ...credentials, token: secret })).toThrow(errorCode);
            expect(() => sealReleaseCredential(binding, { ...credentials, bypass: secret })).toThrow(errorCode);
        });
    }
    const invalidBindings: Array<Partial<ReleaseCredentialBinding>> = [
        { destinationId: '' }, { workspaceId: 'a'.repeat(129) }, { projectId: '../project' }, { branchId: 'branch_123\n' },
        { teamId: 'other' }, { providerProjectId: 'other' }, { hostname: 'https://ew-site.vercel.app' }, { hostname: 'ew-site.vercel.app\n' },
        { version: 0 }, { version: 1.5 }, { version: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const [index, patch] of invalidBindings.entries()) {
        it(`refuses invalid binding shape ${index + 1}`, () => {
            expect(() => sealReleaseCredential({ ...binding, ...patch }, credentials)).toThrow(errorCode);
        });
    }
    it('refuses extra binding and sealed-object fields', () => {
        const extraBinding = { ...binding, extra: 'not allowed' };
        expect(() => sealReleaseCredential(extraBinding, credentials)).toThrow(errorCode);
        const extraSealed = { ...sealReleaseCredential(binding, credentials), extra: 'not allowed' };
        expect(() => openReleaseCredential(binding, extraSealed)).toThrow(errorCode);
    });
});
