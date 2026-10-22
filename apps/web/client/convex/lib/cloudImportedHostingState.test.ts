import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    IMPORTED_HOSTING_BUILD, IMPORTED_HOSTING_INSTALL, IMPORTED_HOSTING_PROFILE, IMPORTED_HOSTING_TOOLCHAIN,
    assertImportedHostingBinding, assertImportedHostingBuildPolicy, assertImportedHostingCandidate,
    assertImportedHostingOperationPins, assertImportedHostingSeal, serializeImportedHostingBuildPolicy,
    serializeImportedHostingCandidate, type ImportedHostingBuildPolicy, type ImportedHostingCandidate,
} from './cloudImportedHostingState';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
function policy(): ImportedHostingBuildPolicy {
    return { version: 1, profile: IMPORTED_HOSTING_PROFILE, toolchain: { ...IMPORTED_HOSTING_TOOLCHAIN },
        installCommand: IMPORTED_HOSTING_INSTALL, buildCommand: IMPORTED_HOSTING_BUILD, deployHash: 'a'.repeat(64),
        configs: ['bun.lock', 'next.config.ts', 'package.json', 'tsconfig.json'].map(path => ({ path, hash: 'b'.repeat(64), bytes: 12 })),
        plugins: [{ name: 'next', version: '16.3.1', integrity }, { name: 'typescript', version: '5.9.3', integrity }] };
}
function candidate(receipt = policy()): ImportedHostingCandidate {
    return { version: 1, profile: IMPORTED_HOSTING_PROFILE, projectId: 'projects:one', branchId: 'branches:one',
        workspaceId: 'workspaces:one', actorId: 'users:collaborator', revision: 3,
        importedHosting: { version: 1, profile: IMPORTED_HOSTING_PROFILE, artifactId: 'cloudReleases:private',
            artifactHash: 'c'.repeat(64), deployHash: receipt.deployHash,
            buildPolicyHash: hash(serializeImportedHostingBuildPolicy(receipt)), visibility: 'protected-only' } };
}

describe('imported hosting V8 receipts', () => {
    it('has one canonical policy preimage independent of object key insertion order', () => {
        const receipt = policy();
        const reversed = Object.fromEntries(Object.entries(receipt).reverse()) as ImportedHostingBuildPolicy;
        expect(serializeImportedHostingBuildPolicy(reversed)).toBe(serializeImportedHostingBuildPolicy(receipt));
        expect(serializeImportedHostingBuildPolicy(receipt).endsWith('\n')).toBe(false);
        expect(serializeImportedHostingBuildPolicy(receipt)).toContain('node ./node_modules/next/dist/bin/next build --webpack');
        expect(() => assertImportedHostingBuildPolicy({ ...receipt, providerVerified: true })).toThrow('INVALID_RECEIPT');
    });

    it('refuses widened toolchains, commands, plugin names and noncanonical tuples', () => {
        const receipt = policy();
        const invalid: unknown[] = [
            { ...receipt, version: 2 }, { ...receipt, installCommand: 'bun install' },
            { ...receipt, buildCommand: 'bun run build' }, { ...receipt, toolchain: { ...receipt.toolchain, node: 'latest' } },
            { ...receipt, toolchain: { ...receipt.toolchain, provider: 'verified' } },
            { ...receipt, configs: [...receipt.configs].reverse() }, { ...receipt, configs: [...receipt.configs, receipt.configs[0]] },
            { ...receipt, configs: receipt.configs.map(item => ({ ...item, bytes: 0 })) },
            { ...receipt, plugins: [{ name: 'other', version: '1.0.0', integrity }] },
            { ...receipt, plugins: receipt.plugins.map(item => ({ ...item, version: 'latest' })) },
            { ...receipt, plugins: receipt.plugins.map(item => ({ ...item, integrity: integrity + '\n' })) },
            { ...receipt, configs: receipt.configs.map(item => ({ ...item, path: item.path + '\n' })) },
            { ...receipt, deployHash: receipt.deployHash + '\n' },
        ];
        for (const value of invalid) expect(() => assertImportedHostingBuildPolicy(value)).toThrow('INVALID_RECEIPT');
    });

    it('requires exact sorted direct build participants for the admitted PostCSS configuration', () => {
        const receipt = policy();
        receipt.configs.push({ path: 'postcss.config.mjs', hash: 'd'.repeat(64), bytes: 50 });
        receipt.configs.sort((a, b) => a.path < b.path ? -1 : 1);
        expect(() => assertImportedHostingBuildPolicy(receipt)).toThrow('INVALID_RECEIPT');
        receipt.plugins = [{ name: '@tailwindcss/postcss', version: '4.3.3', integrity }, ...receipt.plugins.slice(0, 1),
            { name: 'tailwindcss', version: '4.3.3', integrity }, ...receipt.plugins.slice(1)];
        expect(() => assertImportedHostingBuildPolicy(receipt)).not.toThrow();
    });

    it('keeps actor and hosting visibility in candidate identity without granting authority', () => {
        const value = candidate(), json = serializeImportedHostingCandidate(value);
        expect(serializeImportedHostingCandidate({ ...value, actorId: 'users:other' })).not.toBe(json);
        expect(serializeImportedHostingCandidate({ ...value, importedHosting: { ...value.importedHosting, visibility: 'publishable' } })).not.toBe(json);
        expect(() => assertImportedHostingCandidate({ ...value, historicalActorId: 'users:creator' })).toThrow('INVALID_CANDIDATE');
        for (const actorId of ['', 'x\n', 'x'.repeat(129)]) expect(() => assertImportedHostingCandidate({ ...value, actorId })).toThrow('INVALID_CANDIDATE');
        for (const revision of [-1, 0.5, NaN]) expect(() => assertImportedHostingCandidate({ ...value, revision })).toThrow('INVALID_CANDIDATE');
    });

    it('rejects malformed binding fields and trailing-newline hashes', () => {
        const binding = candidate().importedHosting;
        for (const key of ['artifactHash', 'deployHash', 'buildPolicyHash'] as const) {
            expect(() => assertImportedHostingBinding({ ...binding, [key]: binding[key] + '\n' })).toThrow('INVALID_CANDIDATE');
        }
        expect(() => assertImportedHostingBinding({ ...binding, visibility: 'public' })).toThrow('INVALID_CANDIDATE');
        expect(() => assertImportedHostingBinding({ ...binding, allowedAssets: [] })).toThrow('INVALID_CANDIDATE');
    });

    it('independently verifies exact candidate and policy preimages at the V8 seam', async () => {
        const receipt = policy(), value = candidate(receipt), artifactJson = serializeImportedHostingCandidate(value);
        const seal = { candidate: value, buildPolicyReceipt: receipt, artifactJson, hash: hash(artifactJson) };
        await assertImportedHostingSeal(seal);
        await expect(assertImportedHostingSeal({ ...seal, artifactJson: artifactJson + '\n' })).rejects.toThrow('ARTIFACT_MISMATCH');
        await expect(assertImportedHostingSeal({ ...seal, hash: value.importedHosting.deployHash })).rejects.toThrow('ARTIFACT_MISMATCH');
        await expect(assertImportedHostingSeal({ ...seal, buildPolicyReceipt: { ...receipt, deployHash: 'f'.repeat(64) } })).rejects.toThrow('ARTIFACT_MISMATCH');
        const changed = policy(); changed.configs[0]!.hash = 'e'.repeat(64);
        await expect(assertImportedHostingSeal({ ...seal, buildPolicyReceipt: changed })).rejects.toThrow('ARTIFACT_MISMATCH');
    });

    it('never conflates the immutable candidate identity with the uploaded inventory hash', () => {
        const value = candidate(), candidateHash = hash(serializeImportedHostingCandidate(value));
        const pins = { sourceHash: candidateHash, deployHash: value.importedHosting.deployHash, buildPolicyHash: value.importedHosting.buildPolicyHash };
        expect(() => assertImportedHostingOperationPins(pins, candidateHash, value.importedHosting)).not.toThrow();
        expect(() => assertImportedHostingOperationPins({ ...pins, sourceHash: pins.deployHash }, candidateHash, value.importedHosting)).toThrow('INVALID_OPERATION');
        expect(() => assertImportedHostingOperationPins({ ...pins, ignored: true }, candidateHash, value.importedHosting)).toThrow('INVALID_OPERATION');
    });
});
