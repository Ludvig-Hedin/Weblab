'use node';

import { createHash } from 'node:crypto';
import { destinationKey } from './cloudReleasePolicy';
import { decryptProviderToken, encryptProviderToken } from './providerTokens';
import { IMPORTED_HOSTING_PROFILE } from './cloudImportedHostingState';

export type ReleaseCredentialBinding = {
    destinationId: string;
    workspaceId: string;
    projectId: string;
    branchId: string;
    teamId: string;
    providerProjectId: string;
    hostname: string;
    version: number;
    hostingProfile?: typeof IMPORTED_HOSTING_PROFILE;
};

type Credentials = { token: string; bypass: string };
type SealedCredential = { ciphertext: string; ciphertextHash: string };
const bindingKeys = ['destinationId', 'workspaceId', 'projectId', 'branchId', 'teamId', 'providerProjectId', 'hostname', 'version'] as const;
const identifierKeys = ['destinationId', 'workspaceId', 'projectId', 'branchId', 'teamId', 'providerProjectId'] as const;
const invalid = () => new Error('CLOUD_RELEASE_CREDENTIAL_INVALID');

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw invalid();
    return value as Record<string, unknown>;
}

function validateBinding(binding: ReleaseCredentialBinding): void {
    const imported = binding.hostingProfile === IMPORTED_HOSTING_PROFILE;
    object(binding, imported ? [...bindingKeys, 'hostingProfile'] : bindingKeys);
    for (const key of identifierKeys) {
        if (typeof binding[key] !== 'string' || /[\r\n]/.test(binding[key]) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(binding[key])) throw invalid();
    }
    if (typeof binding.hostname !== 'string' || binding.hostname.length > 253 || /[\r\n]/.test(binding.hostname) ||
        !Number.isSafeInteger(binding.version) || binding.version < 1) throw invalid();
    destinationKey(binding.teamId, binding.providerProjectId, binding.hostname);
}

function validateSecret(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\r\n]/.test(value)) throw invalid();
}

function ciphertextHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function envelopeJson(binding: ReleaseCredentialBinding, credentials: Credentials): string {
    return JSON.stringify({ envelopeVersion: binding.hostingProfile === undefined ? 1 : 2,
        destinationId: binding.destinationId, workspaceId: binding.workspaceId,
        projectId: binding.projectId, branchId: binding.branchId, teamId: binding.teamId,
        providerProjectId: binding.providerProjectId, hostname: binding.hostname, version: binding.version,
        ...(binding.hostingProfile === undefined ? {} : { hostingProfile: binding.hostingProfile }),
        token: credentials.token, bypass: credentials.bypass });
}

export function sealReleaseCredential(binding: ReleaseCredentialBinding, credentials: Credentials): SealedCredential {
    try {
        validateBinding(binding);
        object(credentials, ['token', 'bypass']);
        validateSecret(credentials.token);
        validateSecret(credentials.bypass);
        // Explicit order makes the plaintext canonical regardless of caller property order.
        const ciphertext = encryptProviderToken(envelopeJson(binding, credentials));
        return { ciphertext, ciphertextHash: ciphertextHash(ciphertext) };
    } catch { throw invalid(); }
}

export function openReleaseCredential(binding: ReleaseCredentialBinding, sealed: SealedCredential): Credentials {
    try {
        validateBinding(binding);
        object(sealed, ['ciphertext', 'ciphertextHash']);
        if (typeof sealed.ciphertext !== 'string' || !sealed.ciphertext || sealed.ciphertext.length > 131_072 ||
            Buffer.from(sealed.ciphertext, 'base64').toString('base64') !== sealed.ciphertext ||
            typeof sealed.ciphertextHash !== 'string' || !/^[a-f0-9]{64}$/.test(sealed.ciphertextHash) ||
            ciphertextHash(sealed.ciphertext) !== sealed.ciphertextHash) throw invalid();
        const imported = binding.hostingProfile !== undefined;
        const plaintext = decryptProviderToken(sealed.ciphertext);
        const envelope = object(JSON.parse(plaintext), ['envelopeVersion', ...bindingKeys, ...(imported ? ['hostingProfile'] : []), 'token', 'bypass']);
        if (envelope.envelopeVersion !== (imported ? 2 : 1) || !bindingKeys.every(key => envelope[key] === binding[key]) ||
            (imported && envelope.hostingProfile !== binding.hostingProfile)) throw invalid();
        validateSecret(envelope.token);
        validateSecret(envelope.bypass);
        if (imported && plaintext !== envelopeJson(binding, { token: envelope.token, bypass: envelope.bypass })) throw invalid();
        return { token: envelope.token, bypass: envelope.bypass };
    } catch { throw invalid(); }
}

/** Select the authenticated row's bound fields; never accept its extra DB fields as envelope data. */
export function openRegisteredReleaseCredential(row: ReleaseCredentialBinding & SealedCredential): Credentials {
    const { destinationId, workspaceId, projectId, branchId, teamId, providerProjectId, hostname, version, hostingProfile, ciphertext, ciphertextHash } = row;
    return openReleaseCredential({ destinationId, workspaceId, projectId, branchId, teamId, providerProjectId, hostname, version,
        ...(hostingProfile === undefined ? {} : { hostingProfile }) }, { ciphertext, ciphertextHash });
}
