'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { readProcessTable, sameProcess } = require('../cli/process-identity');
const { sha256 } = require('./policy');

const FILE_FLAGS = fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const KEY = /^[a-f0-9]{64}$/;

function sameFile(a, b) {
    return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

class ReleaseStore {
    constructor(base, safeStorage) {
        this.base = path.resolve(base);
        this.safeStorage = safeStorage;
    }

    async directory(key) {
        if (!KEY.test(key)) throw new Error('Invalid release storage identity.');
        await fsp.mkdir(this.base, { recursive: true, mode: 0o700 });
        // Validate every ancestor, not only the leaf that we just created.
        let ancestor = this.base;
        for (;;) {
            const stat = await fsp.lstat(ancestor);
            if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Release storage path is unsafe.');
            const parent = path.dirname(ancestor);
            if (parent === ancestor) break;
            ancestor = parent;
        }
        const directory = path.join(this.base, key);
        await fsp.mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
        const stat = await fsp.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Release storage directory is unsafe.');
        return directory;
    }

    async read(directory, name, maxBytes = 1024 * 1024) {
        const target = path.join(directory, name);
        let handle;
        try { handle = await fsp.open(target, fs.constants.O_RDONLY | FILE_FLAGS); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        try {
            const before = await handle.stat();
            if (!before.isFile() || before.size > maxBytes || (before.mode & 0o077)) throw new Error('Release storage file is unsafe.');
            const bytes = await handle.readFile();
            const after = await handle.stat();
            if (!sameFile(before, after) || !sameFile(after, await fsp.lstat(target))) throw new Error('Release storage changed during reading.');
            return bytes;
        } finally { await handle.close(); }
    }

    async write(directory, name, bytes, expected) {
        if (!Buffer.isBuffer(bytes)) throw new Error('Invalid release storage bytes.');
        const target = path.join(directory, name);
        const temporary = path.join(directory, `.${randomUUID()}.tmp`);
        const handle = await fsp.open(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | FILE_FLAGS, 0o600);
        try {
            await handle.writeFile(bytes);
            await handle.sync();
            const current = await this.read(directory, name, Math.max(bytes.length, 150 * 1024 * 1024));
            if ((expected === null && current !== null) || (expected !== null && (!current || !current.equals(expected)))) {
                throw new Error('Another app changed the saved release. Reload before continuing.');
            }
            await fsp.rename(temporary, target);
            const dir = await fsp.open(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
            try { await dir.sync(); } finally { await dir.close(); }
        } finally {
            await handle.close();
            await fsp.rm(temporary, { force: true });
        }
    }

    async locked(key, operation) {
        const directory = await this.directory(key);
        const lockPath = path.join(directory, 'operation.lock');
        const self = (await readProcessTable()).get(process.pid);
        if (!self) throw new Error('App process identity could not be verified.');
        const owner = { pid: self.pid, start: self.start, nonce: randomUUID() };
        const temporary = `.${owner.nonce}.lock`;
        const tmpPath = path.join(directory, temporary);
        const handle = await fsp.open(tmpPath, 'wx', 0o600);
        try {
            await handle.writeFile(JSON.stringify(owner));
            await handle.sync();
            try { await fsp.link(tmpPath, lockPath); }
            catch (error) {
                if (error.code !== 'EEXIST') throw error;
                const priorStat = await fsp.lstat(lockPath);
                const priorBytes = await this.read(directory, 'operation.lock');
                let prior;
                try { prior = JSON.parse(priorBytes.toString('utf8')); } catch { throw new Error('Publishing lock needs manual recovery.'); }
                if (!Number.isSafeInteger(prior.pid) || typeof prior.start !== 'string' || typeof prior.nonce !== 'string') throw new Error('Publishing lock needs manual recovery.');
                const active = (await readProcessTable()).get(prior.pid);
                if (active && sameProcess(active, prior)) throw new Error('Another app is publishing this project.');
                if (!sameFile(priorStat, await fsp.lstat(lockPath))) throw new Error('Publishing lock changed.');
                await fsp.unlink(lockPath);
                await fsp.link(tmpPath, lockPath);
            }
            const ownStat = await fsp.lstat(lockPath);
            try { return await operation(directory); }
            finally {
                const current = await this.read(directory, 'operation.lock');
                if (!current || !current.equals(Buffer.from(JSON.stringify(owner))) || !sameFile(ownStat, await fsp.lstat(lockPath))) {
                    throw new Error('Publishing lock ownership changed.');
                }
                await fsp.unlink(lockPath);
            }
        } finally {
            await handle.close();
            await fsp.rm(tmpPath, { force: true });
        }
    }

    async connection(directory) {
        this.requireEncryption();
        const bytes = await this.read(directory, 'connection.encrypted');
        return bytes ? JSON.parse(this.safeStorage.decryptString(bytes)) : null;
    }

    async saveConnection(directory, connection) {
        this.requireEncryption();
        const prior = await this.read(directory, 'connection.encrypted');
        await this.write(directory, 'connection.encrypted', this.safeStorage.encryptString(JSON.stringify(connection)), prior);
    }

    async state(directory) {
        const bytes = await this.read(directory, 'state.json');
        let state;
        if (bytes) {
            const envelope = JSON.parse(bytes.toString('utf8'));
            if (typeof envelope.content !== 'string' || typeof envelope.mac !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.mac)) throw new Error('Saved publishing history is unauthenticated.');
            const expected = this.mac(await this.stateKey(directory, false), directory, envelope.content);
            if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(envelope.mac, 'hex'))) throw new Error('Saved publishing history changed outside Weblab.');
            state = JSON.parse(envelope.content);
        } else {
            if (await this.read(directory, 'state-key.encrypted')) throw new Error('Saved publishing history is missing. Recover it before continuing.');
            state = { version: 1, releases: [], live: null, pending: null };
        }
        if (state.version !== 1 || !Array.isArray(state.releases) || state.releases.length > 100) throw new Error('Saved publishing history is invalid.');
        return { state, bytes };
    }

    async saveState(directory, state, expected) {
        const content = JSON.stringify(state);
        const key = await this.stateKey(directory, expected === null);
        const envelope = Buffer.from(JSON.stringify({ content, mac: this.mac(key, directory, content) }));
        await this.write(directory, 'state.json', envelope, expected);
    }

    requireEncryption() {
        if (!this.safeStorage?.isEncryptionAvailable() || this.safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
            throw new Error('Secure credential storage is unavailable.');
        }
    }

    async stateKey(directory, create) {
        this.requireEncryption();
        let encrypted = await this.read(directory, 'state-key.encrypted');
        if (!encrypted) {
            if (!create) throw new Error('The protected publishing history key is missing.');
            encrypted = this.safeStorage.encryptString(randomBytes(32).toString('hex'));
            await this.write(directory, 'state-key.encrypted', encrypted, null);
        }
        const hex = this.safeStorage.decryptString(encrypted);
        if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('The protected publishing history key is invalid.');
        return Buffer.from(hex, 'hex');
    }

    mac(key, directory, content) {
        return createHmac('sha256', key).update(directory).update('\0').update(content).digest('hex');
    }

    async saveArtifact(directory, releaseId, release) {
        if (!/^[a-f0-9-]{36}$/.test(releaseId)) throw new Error('Invalid release ID.');
        const content = Buffer.from(JSON.stringify({ hash: release.hash, files: release.files.map((file) => ({ path: file.path, bytes: file.bytes.toString('base64') })) }));
        if (content.length > 150 * 1024 * 1024) throw new Error('Saved release is too large.');
        await this.write(directory, `${releaseId}.json`, content, null);
        return sha256(content);
    }

    async artifact(directory, releaseId, expectedHash) {
        if (!/^[a-f0-9-]{36}$/.test(releaseId)) throw new Error('Invalid release ID.');
        const bytes = await this.read(directory, `${releaseId}.json`, 150 * 1024 * 1024);
        if (!bytes || sha256(bytes) !== expectedHash) throw new Error('Saved release bytes changed.');
        const data = JSON.parse(bytes.toString('utf8'));
        return { hash: data.hash, files: data.files.map((file) => ({ path: file.path, bytes: Buffer.from(file.bytes, 'base64') })) };
    }
}

module.exports = { ReleaseStore };
