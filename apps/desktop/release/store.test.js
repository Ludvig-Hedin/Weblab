import { expect, test } from 'bun:test';
import { mkdtemp, readFile, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ReleaseStore } from './store';

// Models authenticated encryption without pretending to test macOS Keychain.
function storage() {
    const key = randomBytes(32);
    return {
        isEncryptionAvailable: () => true,
        encryptString(text) {
            const iv = randomBytes(12);
            const cipher = createCipheriv('aes-256-gcm', key, iv);
            const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
            return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
        },
        decryptString(bytes) {
            const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
            cipher.setAuthTag(bytes.subarray(12, 28));
            return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString();
        },
    };
}

async function fixture(run) {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'weblab-release-store-')));
    try {
        const store = new ReleaseStore(base, storage());
        await store.locked('a'.repeat(64), (directory) => run(store, directory));
    } finally { await rm(base, { recursive: true, force: true }); }
}

test('encrypted credentials round-trip and unavailable storage refuses to save', async () => {
    await fixture(async (store, directory) => {
        const connection = { token: 'private-access-token', projectId: 'project1' };
        await store.saveConnection(directory, connection);
        expect((await readFile(join(directory, 'connection.encrypted'))).includes('private-access-token')).toBe(false);
        expect(await store.connection(directory)).toEqual(connection);
        store.safeStorage = { isEncryptionAvailable: () => false };
        await expect(store.saveConnection(directory, connection)).rejects.toThrow('unavailable');
    });
});

test('changing state and artifact checksums together cannot replace reviewed bytes', async () => {
    await fixture(async (store, directory) => {
        const record = await store.state(directory);
        await store.saveState(directory, record.state, record.bytes);
        const file = join(directory, 'state.json');
        const envelope = JSON.parse(await readFile(file, 'utf8'));
        const content = JSON.parse(envelope.content);
        content.releases.push({ id: 'forged', artifactHash: 'forged' });
        envelope.content = JSON.stringify(content);
        await writeFile(file, JSON.stringify(envelope), { mode: 0o600 });
        await expect(store.state(directory)).rejects.toThrow('changed outside');
    });
});

test('a missing existing history fails closed and stale saves cannot overwrite a newer version', async () => {
    await fixture(async (store, directory) => {
        const first = await store.state(directory);
        await store.saveState(directory, first.state, first.bytes);
        await expect(store.saveState(directory, first.state, first.bytes)).rejects.toThrow('Another app');
        await rm(join(directory, 'state.json'));
        await expect(store.state(directory)).rejects.toThrow('history is missing');
    });
});

test('artifact reads refuse changed bytes and credential symlinks', async () => {
    await fixture(async (store, directory) => {
        const id = '12345678-1234-1234-1234-123456789abc';
        const release = { hash: 'source', files: [{ path: 'logo.png', bytes: Buffer.from([0, 255]) }] };
        const digest = await store.saveArtifact(directory, id, release);
        expect((await store.artifact(directory, id, digest)).files[0].bytes).toEqual(Buffer.from([0, 255]));
        await writeFile(join(directory, id + '.json'), '{}', { mode: 0o600 });
        await expect(store.artifact(directory, id, digest)).rejects.toThrow('bytes changed');
        await symlink(join(directory, id + '.json'), join(directory, 'connection.encrypted'));
        await expect(store.connection(directory)).rejects.toThrow();
    });
});
