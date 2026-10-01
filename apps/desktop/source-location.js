/**
 * Private source-location registry. No method grants filesystem access or edits
 * an original project. Call capture only for a newly created trusted copy.
 *
 * createSourceLocations({base, bookmark?}) exposes:
 * capture(copyId, sourcePath): enroll a new original, never overwrite a record.
 * inspect(copyId, fallbackPath, {resolve=false}): available/missing/
 * permissionDenied/needsConfirmation, sourcePath, generation, identity.
 * prepare(copyId, candidatePath): opaque expiring token, previousPath and the
 * checked candidate. The caller must validate Git compatibility beforehand.
 * confirm(copyId, token, {validateCandidate?}): rechecks identity and generation,
 * awaits the caller's Git-layout validation under the lock, persists the choice.
 * assertCurrent(copyId, generation, sourcePath, identity): reject stale plans.
 * findByPath(candidatePath, activeCopyIds?): unique saved binding by checked directory identity,
 * or null. Does not resolve bookmarks or enroll unknown originals.
 *
 * bookmark adapters provide async create(path)->base64 and
 * resolve(base64)->{path, stale}. Native adapter is quiet and macOS-only.
 * Storage/invalid/stale failures reject with a sanitized Error.code. Bookmark
 * failures only disable automatic recovery. Legacy records need confirmation.
 */
const fs = require('fs/promises');
const { constants } = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BOOKMARK = 65536;
const queues = new Map();
const validPath = (value) => typeof value === 'string' && value.length > 0 &&
    value.length <= 4096 && !value.includes('\0') && path.isAbsolute(value) && path.resolve(value) === value;
const validIdentity = (value) => value && typeof value === 'object' &&
    /^\d+$/.test(value.dev) && /^\d+$/.test(value.ino) &&
    typeof value.dev === 'string' && typeof value.ino === 'string' &&
    value.dev.length < 32 && value.ino.length < 32 &&
    (value.birthtimeNs === undefined || (typeof value.birthtimeNs === 'string' &&
        /^\d{1,32}$/.test(value.birthtimeNs)));
const equalIdentity = (a, b) => validIdentity(a) && validIdentity(b) &&
    a.dev === b.dev && a.ino === b.ino &&
    (!a.birthtimeNs || !b.birthtimeNs || a.birthtimeNs === b.birthtimeNs);
function failure(code) { return Object.assign(new Error(code), { code }); }
function requireId(id) { if (typeof id !== 'string' || !ID.test(id)) throw failure('invalid_copy_id'); }

async function safeDirectory(root, create = false) {
    if (!validPath(root)) throw failure('invalid_source_path');
    // Check ancestors before mkdir/chmod; a symlink must never redirect storage.
    const segments = root.split(path.sep).filter(Boolean);
    let current = path.parse(root).root;
    for (const segment of segments) {
        current = path.join(current, segment);
        try {
            const st = await fs.lstat(current);
            if (st.isSymbolicLink() || !st.isDirectory()) throw failure('unsafe_directory');
        } catch (err) {
            if (err.code !== 'ENOENT' || !create) throw err;
            await fs.mkdir(current, { mode: 0o700 });
        }
    }
    if (await fs.realpath(root) !== root) throw failure('unsafe_directory');
    const st = await fs.lstat(root, { bigint: true });
    if (st.isSymbolicLink() || !st.isDirectory()) throw failure('unsafe_directory');
    return { dev: String(st.dev), ino: String(st.ino), birthtimeNs: String(st.birthtimeNs) };
}

function bookmarkHelperPath(moduleDirectory = __dirname, resourcesDirectory = process.resourcesPath) {
    if (/(^|[/\\])[^/\\]+\.asar([/\\]|$)/.test(moduleDirectory)) {
        if (typeof resourcesDirectory !== 'string' || !path.isAbsolute(resourcesDirectory)) throw failure('bookmark_unavailable');
        return path.join(resourcesDirectory, 'source-bookmark.jxa.js');
    }
    return path.join(moduleDirectory, 'assets/source-bookmark.jxa.js');
}

function nativeBookmark() {
    async function request(payload) {
        if (process.platform !== 'darwin') throw failure('bookmark_unavailable');
        const input = JSON.stringify(payload);
        if (input.length > 70000) throw failure('bookmark_unavailable');
        return new Promise((resolve, reject) => {
            execFile('/usr/bin/osascript', ['-l', 'JavaScript', bookmarkHelperPath(), input],
                { timeout: 5000, maxBuffer: 100000, windowsHide: true }, (error, stdout) => {
                    if (error) return reject(failure('bookmark_unavailable'));
                    try {
                        const result = JSON.parse(stdout.trim());
                        if (result.error) throw failure('bookmark_unavailable');
                        resolve(result);
                    } catch { reject(failure('bookmark_unavailable')); }
                });
        });
    }
    return {
        create: async (sourcePath) => (await request({ operation: 'create', path: sourcePath })).bookmark,
        resolve: async (bookmark) => request({ operation: 'resolve', bookmark }),
    };
}

function createSourceLocations({ base, bookmark = nativeBookmark() }) {
    if (!validPath(base)) throw failure('invalid_storage_path');
    const target = path.join(base, 'source-locations.json');
    const lockPath = path.join(base, 'source-locations.lock');
    const tokens = new Map();
    let storageIdentity;

    async function read() {
        let handle;
        try {
            const before = await fs.lstat(target);
            if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) || before.size > MAX_BYTES) {
                throw failure('unsafe_source_locations');
            }
            handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
            const st = await handle.stat();
            if (!st.isFile() || (st.mode & 0o077) || st.size > MAX_BYTES ||
                st.dev !== before.dev || st.ino !== before.ino) throw failure('unsafe_source_locations');
            const bytes = Buffer.alloc(MAX_BYTES + 1);
            let length = 0;
            while (length < bytes.length) {
                const chunk = await handle.read(bytes, length, bytes.length - length, length);
                if (!chunk.bytesRead) break;
                length += chunk.bytesRead;
            }
            if (length > MAX_BYTES) throw failure('unsafe_source_locations');
            const state = JSON.parse(bytes.subarray(0, length).toString('utf8'));
            if (!state || state.version !== 1 || !state.locations || typeof state.locations !== 'object' ||
                Array.isArray(state.locations) || Object.keys(state.locations).length > 1000) {
                throw failure('invalid_source_locations');
            }
            for (const [id, record] of Object.entries(state.locations)) {
                if (!ID.test(id) || !record || !validPath(record.sourcePath) ||
                    !validPath(record.originalSourcePath) || !validIdentity(record.identity) ||
                    !Number.isSafeInteger(record.generation) || record.generation < 1 ||
                    (record.bookmark !== null && !validBookmark(record.bookmark))) {
                    throw failure('invalid_source_locations');
                }
            }
            return state;
        } catch (err) {
            if (err.code === 'ENOENT') return { version: 1, locations: {} };
            if (err instanceof SyntaxError) throw failure('invalid_source_locations');
            throw err;
        } finally { await handle?.close(); }
    }
    async function write(state) {
        if (!equalIdentity(storageIdentity, await safeDirectory(base))) throw failure('source_storage_changed');
        try {
            const current = await fs.lstat(target);
            if (!current.isFile() || current.isSymbolicLink() || (current.mode & 0o077)) throw failure('unsafe_source_locations');
        } catch (err) { if (err.code !== 'ENOENT') throw err; }
        const content = JSON.stringify(state);
        if (Buffer.byteLength(content) > MAX_BYTES || Object.keys(state.locations).length > 1000) {
            throw failure('source_locations_full');
        }
        const temporary = path.join(base, `${randomUUID()}.source-locations.tmp`);
        try {
            const handle = await fs.open(temporary, 'wx', 0o600);
            try { await handle.writeFile(content); await handle.sync(); }
            finally { await handle.close(); }
            await fs.rename(temporary, target);
            const directory = await fs.open(base, constants.O_RDONLY);
            try { await directory.sync(); } finally { await directory.close(); }
        } finally { await fs.rm(temporary, { force: true }); }
    }
    async function readLock() {
        const before = await fs.lstat(lockPath, { bigint: true });
        if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077n) || before.size > 512n) {
            throw failure('source_location_lock_needs_recovery');
        }
        const handle = await fs.open(lockPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
            const stat = await handle.stat({ bigint: true });
            if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino ||
                (stat.mode & 0o077n) || stat.size > 512n) throw failure('source_location_lock_needs_recovery');
            const bytes = Buffer.alloc(513);
            const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
            if (bytesRead > 512) throw failure('source_location_lock_needs_recovery');
            let owner;
            try { owner = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
            catch { throw failure('source_location_lock_needs_recovery'); }
            if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
                typeof owner.nonce !== 'string' || !ID.test(owner.nonce)) throw failure('source_location_lock_needs_recovery');
            return { stat, owner };
        } finally { await handle.close(); }
    }
    async function removeDeadLock() {
        const { stat, owner } = await readLock();
        try {
            process.kill(owner.pid, 0);
            throw failure('source_locations_locked');
        } catch (err) {
            // Only ESRCH proves that the owner is dead. EPERM and every unknown
            // outcome preserve the lock, including PID reuse by a live process.
            if (err.code !== 'ESRCH') throw failure('source_locations_locked');
        }
        const latest = await fs.lstat(lockPath, { bigint: true });
        if (!latest.isFile() || latest.isSymbolicLink() || latest.dev !== stat.dev ||
            latest.ino !== stat.ino || latest.size !== stat.size || latest.mtimeNs !== stat.mtimeNs ||
            latest.ctimeNs !== stat.ctimeNs) throw failure('source_location_lock_changed');
        await fs.unlink(lockPath);
    }
    async function acquireLock() {
        const nonce = randomUUID();
        const temporary = path.join(base, `${nonce}.source-lock.tmp`);
        const handle = await fs.open(temporary, 'wx', 0o600);
        let published = false;
        try {
            // Publish only complete, synced owner metadata. A crash before the
            // link leaves an inert temporary, never an ownerless active lock.
            await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }));
            await handle.sync();
            const stat = await handle.stat({ bigint: true });
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await fs.link(temporary, lockPath);
                    published = true;
                    return { handle, stat, nonce };
                } catch (err) {
                    if (err.code !== 'EEXIST') throw err;
                    if (attempt) throw failure('source_locations_locked');
                    await removeDeadLock();
                }
            }
            throw failure('source_locations_locked');
        } finally {
            if (!published) await handle.close();
            await fs.rm(temporary, { force: true }).catch(() => {});
        }
    }
    async function locked(operation) {
        const previous = queues.get(base) ?? Promise.resolve();
        const pending = previous.catch(() => {}).then(async () => {
            storageIdentity = await safeDirectory(base, true);
            await fs.chmod(base, 0o700);
            const { handle, stat: owner, nonce } = await acquireLock();
            try {
                return await operation(await read());
            } finally {
                await handle.close();
                const latest = await readLock();
                if (latest.stat.dev !== owner.dev || latest.stat.ino !== owner.ino ||
                    latest.owner.pid !== process.pid || latest.owner.nonce !== nonce) {
                    throw failure('source_location_lock_changed');
                }
                await fs.unlink(lockPath);
            }
        });
        queues.set(base, pending);
        try { return await pending; }
        catch (err) { throw failure(typeof err.code === 'string' ? err.code : 'source_location_unavailable'); }
        finally { if (queues.get(base) === pending) queues.delete(base); }
    }
    function validBookmark(value) {
        return typeof value === 'string' && value.length > 0 && value.length <= MAX_BOOKMARK &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(value);
    }
    async function makeBookmark(sourcePath) {
        try {
            const result = await bookmark.create(sourcePath);
            return validBookmark(result) ? result : null;
        } catch { return null; }
    }
    function result(record, status = 'available') {
        return { status, sourcePath: record.sourcePath, generation: record.generation, identity: { ...record.identity } };
    }
    async function probe(sourcePath) {
        try { return { identity: await safeDirectory(sourcePath) }; }
        catch (err) {
            return { status: ['EACCES', 'EPERM'].includes(err.code) ? 'permissionDenied' :
                ['ENOENT', 'ENOTDIR'].includes(err.code) ? 'missing' : 'needsConfirmation' };
        }
    }
    function nextGeneration(record) {
        const generation = (record?.generation ?? 0) + 1;
        if (!Number.isSafeInteger(generation)) throw failure('source_generation_exhausted');
        return generation;
    }
    function pruneTokens() {
        for (const [token, entry] of tokens) if (entry.expires < Date.now()) tokens.delete(token);
        while (tokens.size >= 128) tokens.delete(tokens.keys().next().value);
    }
    return {
        async findByPath(candidatePath, activeCopyIds) {
            if (activeCopyIds !== undefined && (!Array.isArray(activeCopyIds) || activeCopyIds.length > 1000 ||
                activeCopyIds.some((id) => typeof id !== 'string' || !ID.test(id)))) throw failure('invalid_copy_ids');
            return locked(async (state) => {
                const identity = await safeDirectory(candidatePath);
                const active = activeCopyIds === undefined ? null : new Set(activeCopyIds);
                const matches = Object.entries(state.locations).filter(([id, record]) =>
                    (!active || active.has(id)) && equalIdentity(record.identity, identity));
                if (matches.length !== 1) return null;
                const [copyId, record] = matches[0];
                return { copyId, ...result(record) };
            });
        },
        async capture(copyId, sourcePath) {
            requireId(copyId);
            return locked(async (state) => {
                if (state.locations[copyId]) throw failure('source_location_exists');
                const identity = await safeDirectory(sourcePath);
                const savedBookmark = await makeBookmark(sourcePath);
                if (!equalIdentity(identity, await safeDirectory(sourcePath))) throw failure('source_changed');
                const record = { sourcePath, originalSourcePath: sourcePath, identity, generation: 1, bookmark: savedBookmark };
                state.locations[copyId] = record;
                await write(state);
                return result(record);
            });
        },
        async inspect(copyId, fallbackPath, { resolve = false } = {}) {
            requireId(copyId);
            if (!validPath(fallbackPath)) throw failure('invalid_source_path');
            return locked(async (state) => {
                const record = state.locations[copyId];
                if (!record) return { status: 'needsConfirmation', sourcePath: fallbackPath, generation: 0, identity: null };
                const current = await probe(record.sourcePath);
                if (resolve && record.bookmark) {
                    let recovered;
                    try { recovered = await bookmark.resolve(record.bookmark); } catch { /* Manual fallback. */ }
                    if (validPath(recovered?.path)) {
                        const candidate = await probe(recovered.path);
                        if (equalIdentity(record.identity, candidate.identity)) {
                            const moved = recovered.path !== record.sourcePath;
                            const refreshed = moved || recovered.stale ? await makeBookmark(recovered.path) : null;
                            if (equalIdentity(record.identity, (await probe(recovered.path)).identity)) {
                                if (moved || refreshed) {
                                    record.sourcePath = recovered.path;
                                    if (moved) record.generation = nextGeneration(record);
                                    record.bookmark = refreshed ?? record.bookmark;
                                    await write(state);
                                }
                                return result(record);
                            }
                        }
                    }
                }
                const latest = resolve ? await probe(record.sourcePath) : current;
                if (equalIdentity(record.identity, latest.identity)) return result(record);
                return result(record, latest.identity ? 'needsConfirmation' : latest.status);
            });
        },
        async prepare(copyId, candidatePath) {
            requireId(copyId);
            return locked(async (state) => {
                const identity = await safeDirectory(candidatePath);
                const record = state.locations[copyId];
                pruneTokens();
                const token = randomUUID();
                tokens.set(token, { copyId, sourcePath: candidatePath, identity,
                    generation: record?.generation ?? 0, expires: Date.now() + 5 * 60 * 1000 });
                return { token, sourcePath: candidatePath, previousPath: record?.sourcePath ?? null,
                    generation: record?.generation ?? 0, identity: { ...identity } };
            });
        },
        async confirm(copyId, token, { validateCandidate } = {}) {
            requireId(copyId);
            if (validateCandidate !== undefined && typeof validateCandidate !== 'function') throw failure('invalid_candidate_validator');
            const pending = tokens.get(token);
            tokens.delete(token);
            if (!pending || pending.copyId !== copyId || pending.expires < Date.now()) throw failure('source_confirmation_expired');
            return locked(async (state) => {
                const record = state.locations[copyId];
                if ((record?.generation ?? 0) !== pending.generation) throw failure('source_confirmation_stale');
                if (!equalIdentity(pending.identity, await safeDirectory(pending.sourcePath))) throw failure('source_changed');
                const savedBookmark = await makeBookmark(pending.sourcePath);
                if (validateCandidate) await validateCandidate(pending.sourcePath);
                if (!equalIdentity(pending.identity, await safeDirectory(pending.sourcePath))) throw failure('source_changed');
                const confirmed = { sourcePath: pending.sourcePath, originalSourcePath: record?.originalSourcePath ?? pending.sourcePath,
                    identity: pending.identity, generation: nextGeneration(record), bookmark: savedBookmark };
                state.locations[copyId] = confirmed;
                await write(state);
                return result(confirmed);
            });
        },
        async assertCurrent(copyId, generation, sourcePath, identity) {
            requireId(copyId);
            return locked(async (state) => {
                const record = state.locations[copyId];
                if (!record || record.generation !== generation || record.sourcePath !== sourcePath ||
                    !equalIdentity(record.identity, identity) ||
                    !equalIdentity(record.identity, (await probe(sourcePath)).identity)) throw failure('source_location_stale');
                return result(record);
            });
        },
    };
}

module.exports = { createSourceLocations, nativeBookmark, bookmarkHelperPath };
