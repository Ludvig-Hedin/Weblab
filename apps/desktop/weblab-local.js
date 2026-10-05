/**
 * Bridge between the renderer (Weblab web app inside the BrowserWindow) and the
 * user's LOCAL machine for local-first project editing. Backs the
 * `NodeFsProvider` in @weblab/code-provider, which runs in the renderer and
 * cannot touch Node APIs directly — every filesystem / dev-server / watch
 * operation is delegated here over IPC.
 *
 * Responsibilities:
 *   1. `weblab:localfs:*`   — pick a folder + real fs CRUD, confined to a root.
 *   2. `weblab:localdev:*`  — spawn / stop / probe the project's dev server.
 *   3. file watching        — chokidar on the root; streams change events back
 *                              to the renderer so external edits (VS Code,
 *                              Claude Code) reflect live on the canvas.
 *
 * Origin gate: every handler verifies the senderFrame's origin against
 * `allowedOrigins` (defense in depth — mirrors weblab-cli.js). All fs paths are
 * confined to the per-call project root; `..` / absolute escapes are rejected.
 */

const { privateCredentialPath, privateCopyExclusion } = require('./private-path-policy');

let ipcMain;
let dialog;
let app;
try {
    ({ ipcMain, dialog, app } = require('electron'));
} catch {
    // Non-Electron context (e.g. a headless node integration test). The core
    // fs / dev-server / watch functions need no electron; registerLocalIpc()
    // (the only consumer of ipcMain/dialog) simply won't be called there.
}
const { spawn, execFile, execFileSync } = require('child_process');
const { createHash, randomUUID } = require('crypto');
const { constants: fsConstants } = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const net = require('net');
const os = require('os');
const { pathToFileURL } = require('url');
const { AsyncLocalStorage } = require('async_hooks');
const { readProcessTable } = require('./cli/process-identity');
const { runCapture } = require('./cli/process');

// chokidar is an optional dep until `bun install` runs in apps/desktop. Load it
// lazily so the desktop app still boots (with watch disabled) if it's missing.
let chokidar = null;
try {
    chokidar = require('chokidar');
} catch {
    chokidar = null;
}

function isFromAllowedOrigin(event, allowedOrigins) {
    try {
        const senderUrl =
            (event.senderFrame && event.senderFrame.url) ||
            (event.sender && event.sender.getURL && event.sender.getURL());
        if (!senderUrl) return false;
        return allowedOrigins.has(new URL(senderUrl).origin);
    } catch {
        return false;
    }
}

const grantedRoots = new Set();
let grantsLoaded;
let grantSave = Promise.resolve();
function grantsFile() {
    return app?.getPath
        ? path.join(app.getPath('userData'), 'local-folder-grants.json')
        : path.join(os.tmpdir(), `weblab-local-grants-${process.pid}.json`);
}
async function loadGrants() {
    if (!grantsLoaded) grantsLoaded = (async () => {
        try {
            const file = grantsFile();
            const st = await fsp.lstat(file);
            if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077)) return;
            const roots = JSON.parse(await fsp.readFile(file, 'utf8'));
            if (Array.isArray(roots)) {
                for (const root of roots) if (typeof root === 'string') grantedRoots.add(root);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    })();
    await grantsLoaded;
}
async function grantLocalRoot(folderPath) {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) throw new Error('invalid_root');
    await loadGrants();
    const root = await fsp.realpath(folderPath);
    if (!(await fsp.stat(root)).isDirectory()) throw new Error('not_directory');
    grantSave = grantSave.catch(() => {}).then(async () => {
        if (grantedRoots.has(root)) return;
        const file = grantsFile();
        await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
            await fsp.writeFile(temporary, JSON.stringify([...grantedRoots, root]), { mode: 0o600, flag: 'wx' });
            await fsp.rename(temporary, file);
            grantedRoots.add(root);
        } finally {
            await fsp.rm(temporary, { force: true });
        }
    });
    await grantSave;
    return root;
}
async function requireGrantedRoot(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('invalid_root');
    await loadGrants();
    const canonical = await fsp.realpath(root);
    if (path.resolve(root) !== canonical || !grantedRoots.has(canonical)) throw new Error('ungranted_root');
    if (!(await fsp.stat(canonical)).isDirectory()) throw new Error('invalid_root');
    return canonical;
}

/**
 * Resolve `relPath` inside `root`, rejecting absolute paths and `..` traversal
 * that would escape the project root. Returns the absolute on-disk path.
 */
function resolveWithin(root, relPath) {
    if (typeof root !== 'string' || root.length === 0) {
        throw new Error('invalid_root');
    }
    const normRoot = path.resolve(root);
    const abs = path.resolve(normRoot, relPath == null || relPath === '' ? '.' : relPath);
    if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
        throw new Error('path_escape');
    }
    return abs;
}

function rejectGitMetadataMutation(root, abs) {
    const relative = path.relative(path.resolve(root), abs);
    if (relative.split(path.sep).some((part) => part.toLowerCase() === '.git')) {
        throw new Error('git_metadata_read_only');
    }
}

// A lexical root check alone does not stop `root/link/file` from traversing a
// symlink outside the folder. Reject symlink components for native file reads
// and writes, including the selected root itself.
async function rejectSymlinkPath(root, abs) {
    const normalizedRoot = path.resolve(root);
    const relative = path.relative(normalizedRoot, abs);
    const parts = [normalizedRoot, ...relative.split(path.sep).filter(Boolean)];
    let current = parts[0];
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) current = path.join(current, parts[i]);
        try {
            const st = await fsp.lstat(current);
            if (st.isSymbolicLink()) throw new Error('symlink_path');
        } catch (err) {
            if (err.code === 'ENOENT') return;
            throw err;
        }
    }
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function toBytes(content) {
    return content instanceof Uint8Array ? Buffer.from(content) : Buffer.from(String(content ?? ''));
}

const writeQueues = new Map();
const createdFiles = new Map(); // absolute path -> exact native-created file version
const createdDirectories = new Map(); // absolute path -> exact native-created directory
const CREATED_FILE_ROLLBACK_MS = 30 * 60 * 1000;
async function withWriteLock(abs, operation) {
    const previous = writeQueues.get(abs) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    writeQueues.set(abs, current);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (writeQueues.get(abs) === current) writeQueues.delete(abs);
    }
}

async function currentFile(abs, maxBytes = Infinity) {
    let handle;
    try {
        handle = await fsp.open(abs, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()) throw new Error('not_regular_file');
        if (maxBytes !== Infinity && before.size > BigInt(maxBytes)) throw new Error('file_size_limit');
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (!sameFileVersion(before, after)) throw new Error('file_changed_during_read');
        return { bytes, hash: sha256(bytes), mode: Number(after.mode & 0o777n), stat: after };
    } catch (err) {
        if (err.code === 'ENOENT') return { bytes: null, hash: null, mode: null, stat: null };
        if (err.code === 'ELOOP') throw new Error('symlink_path');
        throw err;
    } finally {
        if (handle) await handle.close();
    }
}

function sameFileVersion(a, b) {
    if (!a || !b) return a === b;
    return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
        a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function sameMovedFile(a, b) {
    return !!a && !!b && a.dev === b.dev && a.ino === b.ino &&
        a.size === b.size && a.mtimeNs === b.mtimeNs && a.mode === b.mode;
}

async function verifyExistingParent(root, abs) {
    await rejectSymlinkPath(root, abs);
    const actualRoot = await fsp.realpath(root);
    const actualParent = await fsp.realpath(path.dirname(abs));
    const expectedRelative = path.relative(path.resolve(root), path.dirname(abs));
    if (path.relative(actualRoot, actualParent) !== expectedRelative) throw new Error('symlink_path');
}

async function readTextFile(root, rel) {
    const abs = resolveWithin(root, rel);
    await verifyExistingParent(root, abs);
    const file = await currentFile(abs);
    if (file.bytes === null) throw Object.assign(new Error('not_found'), { code: 'ENOENT' });
    const bytes = file.bytes;
    if (bytes.includes(0)) return { error: 'binary_file' };
    try {
        return {
            content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
            sha256: file.hash,
        };
    } catch {
        return { error: 'invalid_utf8' };
    }
}

function backupDirectory() {
    const base = app?.getPath ? app.getPath('userData') : os.tmpdir();
    return path.join(base, 'weblab-local-write-backups');
}

const MAX_SUCCESS_BACKUPS = 100;
const MAX_SUCCESS_BACKUP_BYTES = 1024 * 1024 * 1024;
const MAX_UNRESOLVED_BACKUP_BYTES = 1024 * 1024 * 1024;
let backupWriteQueue = Promise.resolve();

async function privateBackupDir(dir) {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const st = await fsp.lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('unsafe_backup_directory');
    await fsp.chmod(dir, 0o700);
}

async function writeUnresolvedBackup(bytes) {
    const operation = backupWriteQueue.catch(() => {}).then(async () => {
        const dir = path.join(backupDirectory(), 'unresolved');
        await privateBackupDir(dir);
        let used = 0;
        for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            try { used += (await fsp.lstat(path.join(dir, entry.name))).size; }
            catch (err) { if (err.code !== 'ENOENT') throw err; }
        }
        // Keep all existing conflict/error copies. Refuse the new write if
        // another snapshot would exhaust the private recovery budget.
        if (used + bytes.length > MAX_UNRESOLVED_BACKUP_BYTES) {
            throw new Error('recovery_backup_quota_exceeded');
        }
        const recoveryPath = path.join(dir, `${Date.now()}-${randomUUID()}.backup`);
        try { await fsp.writeFile(recoveryPath, bytes, { flag: 'wx', mode: 0o600 }); }
        catch (err) {
            await fsp.rm(recoveryPath, { force: true }).catch(() => {});
            throw err;
        }
        return recoveryPath;
    });
    backupWriteQueue = operation;
    return operation;
}

// Only completed writes are pruned. A conflict or failed write keeps its
// original snapshot in unresolved/ until the user recovers it manually.
async function pruneSuccessfulBackups(dir, protectedPath) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.backup')) continue;
        const abs = path.join(dir, entry.name);
        const stat = await fsp.lstat(abs);
        if (stat.isFile()) files.push({ abs, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    files.sort((a, b) => {
        if (a.abs === b.abs) return 0;
        if (a.abs === protectedPath) return -1;
        if (b.abs === protectedPath) return 1;
        return b.mtimeMs - a.mtimeMs;
    });
    let bytes = 0;
    for (let i = 0; i < files.length; i++) {
        bytes += files[i].size;
        if (i >= MAX_SUCCESS_BACKUPS || bytes > MAX_SUCCESS_BACKUP_BYTES) {
            await fsp.rm(files[i].abs, { force: true });
        }
    }
}

async function markBackupSuccessful(recoveryPath) {
    if (!recoveryPath) return undefined;
    const dir = path.join(backupDirectory(), 'successful');
    await privateBackupDir(dir);
    const retainedPath = path.join(dir, path.basename(recoveryPath));
    await fsp.rename(recoveryPath, retainedPath);
    await pruneSuccessfulBackups(dir, retainedPath).catch(() => {});
    return retainedPath;
}

/**
 * Optimistic native write. The temporary file is renamed atomically after a
 * second hash/inode check. Another process can still write in the tiny
 * check/rename gap; Node does not expose cross-process compare-and-swap rename
 * or openat/renameat to pin parent directories. The checks and private exact
 * backup reduce this risk but cannot make concurrent external writes safe.
 */
async function writeIfUnchanged(root, rel, content, expectedSha256) {
    let abs;
    try {
        abs = resolveWithin(root, rel);
        rejectGitMetadataMutation(root, abs);
    } catch (err) {
        return { error: err.message };
    }
    if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        return { error: 'invalid_expected_sha256' };
    }
    return withWriteLock(abs, async () => {
        let temporaryPath;
        let recoveryPath;
        let createdIdentity;
        let creationLinked = false;
        try {
            await rejectSymlinkPath(root, abs);
            try { await verifyExistingParent(root, abs); }
            catch (err) { if (err.code !== 'ENOENT') throw err; }
            const before = await currentFile(abs);
            if (before.bytes !== null && before.bytes.length > MAX_SUCCESS_BACKUP_BYTES) {
                throw new Error('file_too_large_for_safe_backup');
            }
            // Back up the actual pre-write bytes, including when the caller's
            // hash is stale. Keep the backup outside the project and private.
            if (before.bytes !== null) {
                recoveryPath = await writeUnresolvedBackup(before.bytes);
            }
            if (before.hash !== expectedSha256) {
                return { conflict: true, hash: before.hash, recoveryPath };
            }
            if (cmsInstallContext.getStore()?.root === root) assertSiteInstallActive();
            await fsp.mkdir(path.dirname(abs), { recursive: true });
            await verifyExistingParent(root, abs);
            temporaryPath = path.join(path.dirname(abs), `.weblab-${randomUUID()}.tmp`);
            const bytes = toBytes(content);
            const handle = await fsp.open(temporaryPath, 'wx', 0o600);
            try {
                await handle.writeFile(bytes);
                if (before.mode !== null) await handle.chmod(before.mode);
                await handle.sync();
                createdIdentity = await handle.stat({ bigint: true });
            } finally {
                await handle.close();
            }
            await verifyExistingParent(root, abs);
            const latest = await currentFile(abs);
            if (latest.hash !== expectedSha256 || !sameFileVersion(before.stat, latest.stat)) {
                return { conflict: true, hash: latest.hash, recoveryPath };
            }
            // Recheck immediately before the final path operation. This is
            // best-effort only; an external process can still swap a parent or
            // target after this check and before link()/rename().
            await verifyExistingParent(root, abs);
            if (cmsInstallContext.getStore()?.root === root) assertSiteInstallActive();
            if (expectedSha256 === null) {
                // link() is no-replace: an external creator wins atomically.
                try {
                    await fsp.link(temporaryPath, abs);
                    creationLinked = true;
                } catch (err) {
                    if (err.code === 'EEXIST') return { conflict: true, hash: (await currentFile(abs)).hash, recoveryPath };
                    throw err;
                }
            } else {
                await fsp.rename(temporaryPath, abs);
                createdFiles.delete(abs);
            }
            if (recoveryPath) {
                try { recoveryPath = await markBackupSuccessful(recoveryPath); }
                catch { /* keep the original unresolved snapshot */ }
            }
            return { success: true, hash: sha256(bytes), recoveryPath };
        } catch (err) {
            return { error: err.message, recoveryPath };
        } finally {
            if (temporaryPath) await fsp.rm(temporaryPath, { force: true }).catch(() => {});
            if (creationLinked && createdIdentity) {
                try {
                    const created = await currentFile(abs);
                    if (created.hash === sha256(toBytes(content)) &&
                        created.stat?.dev === createdIdentity.dev &&
                        created.stat?.ino === createdIdentity.ino &&
                        created.stat?.size === createdIdentity.size &&
                        created.stat?.mtimeNs === createdIdentity.mtimeNs) {
                        createdFiles.set(abs, {
                            hash: created.hash,
                            stat: created.stat,
                            expiresAt: Date.now() + CREATED_FILE_ROLLBACK_MS,
                        });
                    }
                } catch { /* creation failed or was changed before provenance capture */ }
            }
        }
    });
}

/** Undo only a recent file created by this process through guarded write. */
async function deleteFileIfUnchanged(root, rel, expectedSha256) {
    let abs;
    try {
        abs = resolveWithin(root, rel);
        rejectGitMetadataMutation(root, abs);
    }
    catch (err) { return { error: err.message }; }
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return { error: 'invalid_expected_sha256' };
    return withWriteLock(abs, async () => {
        const created = createdFiles.get(abs);
        if (!created || created.expiresAt < Date.now() || created.hash !== expectedSha256) {
            createdFiles.delete(abs);
            return { error: 'file_not_recently_created_by_weblab' };
        }
        let recoveryPath;
        let quarantinePath;
        try {
            await verifyExistingParent(root, abs);
            const before = await currentFile(abs);
            if (before.hash !== expectedSha256 || !sameFileVersion(before.stat, created.stat)) {
                createdFiles.delete(abs);
                return { conflict: true, hash: before.hash };
            }
            recoveryPath = await writeUnresolvedBackup(before.bytes);
            await verifyExistingParent(root, abs);
            const latest = await currentFile(abs);
            if (latest.hash !== expectedSha256 || !sameFileVersion(latest.stat, created.stat)) {
                createdFiles.delete(abs);
                return { conflict: true, hash: latest.hash, recoveryPath };
            }
            // Moving into a random sibling lets us inspect what was actually
            // removed from the original path before finally unlinking it.
            // Node still cannot atomically compare an inode and rename it.
            quarantinePath = path.join(path.dirname(abs), `.weblab-delete-${randomUUID()}.tmp`);
            await fsp.rename(abs, quarantinePath);
            const moved = await currentFile(quarantinePath);
            if (moved.hash !== expectedSha256 || !sameMovedFile(moved.stat, created.stat)) {
                try {
                    await fsp.link(quarantinePath, abs); // no replace if another file appeared
                    await fsp.unlink(quarantinePath);
                    quarantinePath = undefined;
                } catch { /* leave the moved file recoverable in the project */ }
                return { conflict: true, hash: moved.hash, recoveryPath, error: quarantinePath
                    ? `File changed during delete; moved file is at ${quarantinePath}`
                    : undefined };
            }
            await fsp.unlink(quarantinePath);
            quarantinePath = undefined;
            createdFiles.delete(abs);
            try { recoveryPath = await markBackupSuccessful(recoveryPath); }
            catch { /* keep the original unresolved snapshot */ }
            return { success: true, recoveryPath };
        } catch (err) {
            if (quarantinePath) {
                try {
                    await fsp.link(quarantinePath, abs);
                    await fsp.unlink(quarantinePath);
                    quarantinePath = undefined;
                } catch { /* preserve moved file at quarantinePath */ }
            }
            return { error: err.message, recoveryPath, quarantinePath };
        }
    });
}

// Local preparation needs one fixed folder for Next.js public assets. Keep
// this narrower than the general-purpose mkdir IPC, which remains disabled.
async function createPreparationPublicDirectory(root) {
    const abs = resolveWithin(root, 'public');
    return withWriteLock(abs, async () => {
        try {
            await rejectSymlinkPath(root, abs);
            await fsp.mkdir(abs, { mode: 0o755 }); // no recursive creation or replacement
            const stat = await fsp.lstat(abs, { bigint: true });
            if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_public_directory');
            createdDirectories.set(abs, {
                dev: stat.dev,
                ino: stat.ino,
                expiresAt: Date.now() + CREATED_FILE_ROLLBACK_MS,
            });
            return { success: true };
        } catch (err) {
            return { error: err.code === 'EEXIST' ? 'public_directory_already_exists' : err.message };
        }
    });
}

async function deletePreparationPublicDirectory(root) {
    const abs = resolveWithin(root, 'public');
    return withWriteLock(abs, async () => {
        const created = createdDirectories.get(abs);
        if (!created || created.expiresAt < Date.now()) {
            createdDirectories.delete(abs);
            return { error: 'directory_not_recently_created_by_weblab' };
        }
        try {
            await rejectSymlinkPath(root, abs);
            const stat = await fsp.lstat(abs, { bigint: true });
            if (!stat.isDirectory() || stat.isSymbolicLink() ||
                stat.dev !== created.dev || stat.ino !== created.ino) {
                return { conflict: true, error: 'public_directory_changed' };
            }
            // rmdir is no-replace and fails if an external process added files.
            await fsp.rmdir(abs);
            createdDirectories.delete(abs);
            return { success: true };
        } catch (err) {
            return { error: err.code === 'ENOTEMPTY' ? 'public_directory_not_empty' : err.message };
        }
    });
}

// --- Shell environment (PATH) -------------------------------------------------
// GUI-launched apps on macOS/Linux inherit a minimal PATH that often lacks
// node/npm. Pull the login shell's PATH once so spawned dev servers can find
// the toolchain. Best-effort + timeout-guarded; falls back to process PATH.
let cachedEnv = null;
function syncedEnv() {
    if (cachedEnv) return cachedEnv;
    let envPath = process.env.PATH || '';
    if (process.platform !== 'win32') {
        try {
            // execFileSync (no shell string interpolation): the shell binary is
            // an argv[0], the script is a fixed literal run BY that login shell
            // to capture its PATH. Avoids the command-injection surface of exec.
            const shell = process.env.SHELL || '/bin/zsh';
            const out = execFileSync(shell, ['-lic', 'echo -n "$PATH"'], {
                timeout: 4000,
                stdio: ['ignore', 'pipe', 'ignore'],
            })
                .toString()
                .trim();
            if (out) envPath = out;
        } catch {
            // keep process PATH
        }
    }
    cachedEnv = { ...process.env, PATH: envPath };
    return cachedEnv;
}

// A project script is user code. Give it a usable toolchain and temporary
// directory without forwarding the editor's service credentials to the child.
function projectDevEnvironment(root, port, bunPath = null) {
    const source = syncedEnv();
    const allowed = [
        'HOME', 'TMPDIR', 'TMP', 'TEMP', 'USER', 'LOGNAME', 'SHELL',
        'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'BUN_INSTALL',
        'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'APPDATA',
        'LOCALAPPDATA', 'USERPROFILE',
    ];
    const env = {};
    for (const key of allowed) {
        if (typeof source[key] === 'string') env[key] = source[key];
    }
    env.PATH = [path.join(root, 'node_modules', '.bin'),
        bunPath && path.isAbsolute(bunPath) ? path.dirname(bunPath) : null, source.PATH || '']
        .filter(Boolean).join(path.delimiter);
    env.PORT = String(port);
    return env;
}

async function localBunExecutable() {
    if (!app?.isPackaged) return 'bun';
    const resources = await fsp.realpath(process.resourcesPath);
    const executable = path.join(resources, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun');
    let stat;
    try { stat = await fsp.lstat(executable); }
    catch { throw new Error('The packaged Bun runtime is missing. Reinstall the desktop app.'); }
    if (!stat.isFile() || stat.isSymbolicLink() || !isPathWithin(resources, await fsp.realpath(executable))) {
        throw new Error('The packaged Bun runtime is missing or unsafe. Reinstall the desktop app.');
    }
    return executable;
}

// This is an explicit renderer action, separate from running a project's dev
// script. Bun runs without a shell, lifecycle scripts, app credentials or the
// user's HOME/cache. Only a registered private Git copy can reach this path.
const dependencyInstalls = new Map();
const startingDevServers = new Set();
// In-flight starts, so a reloaded editor joins the running start instead of
// failing with "already starting".
const pendingDevServerStarts = new Map();
let localShuttingDown = false;
const INSTALL_TIMEOUT_MS = 3 * 60 * 1000;
const INSTALL_MAX_OUTPUT_BYTES = 128 * 1024;
const INSTALL_DETAILS_BYTES = 8 * 1024;
const OTHER_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
const INSTALL_LOCKFILES = ['bun.lock', 'bun.lockb', ...OTHER_LOCKFILES];
const INSTALL_MAX_SCAN_ENTRIES = 100000;
const INSTALL_RECORD_NAME = 'dependency-install.json';
const FOREIGN_LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

function classifyDependencyLockfiles(pkg, locks) {
    const present = INSTALL_LOCKFILES.filter((name) => locks.get(name) !== null);
    if (present.length > 1) throw new Error(`Ambiguous lockfiles: ${present.join(', ')}.`);
    if (present.length !== 1 || !locks.get(present[0])?.length) {
        throw new Error('Exactly one nonempty supported lockfile is required.');
    }
    const name = present[0];
    if (name === 'bun.lock' || name === 'bun.lockb') return { name, foreign: false };
    if (!FOREIGN_LOCKFILES.includes(name)) throw new Error(`${name} is not supported for private dependency setup.`);
    if (pkg.workspaces) {
        throw new Error('Workspace dependency installs are not supported yet.');
    }
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const dependencies = pkg[section];
        if (dependencies && (typeof dependencies !== 'object' || Array.isArray(dependencies))) {
            throw new Error(`Invalid ${section} in package.json.`);
        }
        for (const specifier of Object.values(dependencies ?? {})) {
            if (typeof specifier !== 'string' || /^(?:file|link|workspace|portal|patch):/i.test(specifier)) {
                throw new Error('Local or workspace dependencies need a dedicated install path.');
            }
        }
    }
    const bytes = locks.get(name);
    const content = bytes.toString('utf8');
    let integrities = [];
    if (/(?:^|[\s"'])\b(?:file|link|workspace|portal|patch):/im.test(content)) {
        throw new Error('Local or workspace dependencies need a dedicated install path.');
    }
    if (name === 'package-lock.json') {
        let lock;
        try { lock = JSON.parse(content); }
        catch { throw new Error('package-lock.json is invalid.'); }
        if (![2, 3].includes(lock?.lockfileVersion) || !lock.packages ||
            typeof lock.packages !== 'object' || Array.isArray(lock.packages) ||
            Object.keys(lock.packages).some((key) => key && !key.startsWith('node_modules/')) ||
            Object.entries(lock.packages).some(([key, entry]) => key &&
                (entry?.link === true || typeof entry?.version !== 'string' ||
                    typeof entry?.resolved !== 'string' || !/^https:\/\//i.test(entry.resolved) ||
                    typeof entry?.integrity !== 'string' ||
                    !/^sha(?:1|256|384|512)-[A-Za-z0-9+/=]+$/.test(entry.integrity)))) {
            throw new Error('Only single-package npm v2 or v3 locks are supported.');
        }
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
            const expected = pkg[section] ?? {};
            const locked = lock.packages['']?.[section] ?? {};
            if (JSON.stringify(Object.entries(expected).sort()) !==
                JSON.stringify(Object.entries(locked).sort())) {
                throw new Error('package-lock.json does not match package.json.');
            }
        }
        integrities = Object.entries(lock.packages).filter(([key]) => key)
            .map(([, entry]) => entry.integrity);
    } else if (name === 'yarn.lock') {
        const header = content.replace(/^\uFEFF/, '').split(/\r?\n/, 3);
        if (header[0] !== '# yarn lockfile v1' &&
            !(header[0] === '# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.' &&
                header[1] === '# yarn lockfile v1')) {
            throw new Error('Only Yarn v1 locks are supported.');
        }
        const versions = content.match(/^  version /gm) ?? [];
        integrities = [...content.matchAll(/^  integrity (sha(?:1|256|384|512)-[A-Za-z0-9+/=]+)\r?$/gm)]
            .map((match) => match[1]);
        if (versions.length !== integrities.length) {
            throw new Error('Yarn lock entries without integrity are not supported.');
        }
    } else {
        const importerHeader = /^importers:\s*\r?$/m.exec(content);
        const packagesHeader = /^packages:\s*\r?$/m.exec(content);
        const importerBody = importerHeader && packagesHeader &&
            packagesHeader.index > importerHeader.index
            ? content.slice(importerHeader.index + importerHeader[0].length, packagesHeader.index)
            : '';
        const importerNames = [...importerBody.matchAll(/^  ([^\s][^:\r\n]*):\s*\r?$/gm)]
            .map((match) => match[1]);
        if (!/^lockfileVersion: ['"]?9(?:\.0)?['"]?\s*$/m.test(content) ||
            importerNames.length !== 1 || importerNames[0] !== '.' ||
            /\btarball:/i.test(content)) {
            throw new Error('Only single-package pnpm v9 locks are supported.');
        }
        const resolutions = content.match(/^\s{4}resolution:/gm) ?? [];
        integrities = [...content.matchAll(/\bintegrity: (sha(?:1|256|384|512)-[A-Za-z0-9+/=]+)/g)]
            .map((match) => match[1]);
        if (resolutions.length !== integrities.length) {
            throw new Error('pnpm lock entries without integrity are not supported.');
        }
    }
    const needsPackages = ['dependencies', 'devDependencies', 'optionalDependencies']
        .some((section) => Object.keys(pkg[section] ?? {}).length > 0);
    if (needsPackages && !integrities.length) {
        throw new Error('The source lock has no package integrity pins.');
    }
    return { name, foreign: true, integrities };
}

function installLockIdentity(stat, hash) {
    return {
        hash, dev: String(stat.dev), ino: String(stat.ino),
        size: String(stat.size), mtimeNs: String(stat.mtimeNs), birthtimeNs: String(stat.birthtimeNs),
    };
}

function matchesGeneratedInstallLock(current, owner) {
    return current.stat && owner && /^[a-f0-9]{64}$/.test(owner.hash) &&
        /^generated-bun-lock-[a-f0-9-]{36}\.tmp$/.test(owner.tempName) &&
        ['dev', 'ino', 'size', 'mtimeNs', 'birthtimeNs']
            .every((key) => /^\d+$/.test(owner[key])) &&
        current.hash === owner.hash &&
        Object.entries(installLockIdentity(current.stat, current.hash))
            .every(([key, value]) => owner[key] === value);
}

async function removeOwnedInstallLock(root, container, owner, allowMissing = false) {
    if (!owner) return;
    if (!/^[a-f0-9]{64}$/.test(owner.hash) ||
        !/^generated-bun-lock-[a-f0-9-]{36}\.tmp$/.test(owner.tempName) ||
        !['dev', 'ino', 'size', 'mtimeNs', 'birthtimeNs'].every((key) => /^\d+$/.test(owner[key]))) {
        throw new Error('Private generated lock record is invalid.');
    }
    const file = path.join(root, 'bun.lock');
    const temporary = path.join(container, owner.tempName);
    await rejectSymlinkPath(root, file);
    const [current, staged] = await Promise.all([currentFile(file), currentFile(temporary)]);
    if ((!allowMissing && !current.stat) ||
        (current.stat && !matchesGeneratedInstallLock(current, owner)) ||
        (staged.stat && !matchesGeneratedInstallLock(staged, owner))) {
        throw new Error('Generated bun.lock changed. Inspect the private copy before retrying.');
    }
    if (current.stat) await fsp.unlink(file);
    if (staged.stat) await fsp.unlink(temporary);
}

async function readDependencyInstallRecord(container) {
    const file = path.join(container, INSTALL_RECORD_NAME);
    try {
        const st = await fsp.lstat(file);
        if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) || st.size > 4096) {
            throw new Error('Private dependency install record is unsafe.');
        }
        return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

function installProcessMayBeRunning(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return true;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        if (err.code === 'ESRCH') {
            // Detached POSIX children share Bun's process group. Windows has
            // no equivalent safe liveness query after the parent exits, so
            // an interrupted install needs manual inspection there.
            if (process.platform === 'win32') return true;
            try { process.kill(-pid, 0); return true; }
            catch (groupError) {
                if (groupError.code === 'ESRCH') return false;
                if (groupError.code === 'EPERM') return true;
                throw groupError;
            }
        }
        if (err.code === 'EPERM') return true;
        throw err;
    }
}

async function removeInterruptedInstallTemps(container) {
    for (const name of await fsp.readdir(container)) {
        if (!/^install-[A-Za-z0-9]{6}$/.test(name)) continue;
        const candidate = path.join(container, name);
        const stat = await fsp.lstat(candidate);
        if (!stat.isDirectory() || stat.isSymbolicLink() ||
            await fsp.realpath(candidate) !== candidate) {
            throw new Error('Interrupted dependency install files need manual inspection.');
        }
        await fsp.rm(candidate, { recursive: true, force: true });
    }
}

function dependencyInputHashes(manifest, locks) {
    return {
        manifestSha256: sha256(manifest),
        lockHashes: Object.fromEntries(INSTALL_LOCKFILES.map((name) => [
            name, locks.get(name) ? sha256(locks.get(name)) : null,
        ])),
    };
}

async function privateDependencyInstallIsCurrent(root, container, copyId) {
    const manifest = await regularProjectFile(root, 'package.json');
    if (!manifest) return true; // static HTML projects need no packages
    let pkg;
    try { pkg = JSON.parse(manifest.toString('utf8')); }
    catch { return false; }
    if (!pkg || typeof pkg !== 'object') return false;
    const locks = new Map(await Promise.all(INSTALL_LOCKFILES.map(async (name) =>
        [name, await regularProjectFile(root, name)])));
    const needsPackages = ['dependencies', 'devDependencies', 'optionalDependencies']
        .some((key) => pkg[key] && typeof pkg[key] === 'object' && Object.keys(pkg[key]).length > 0);
    if (!needsPackages && ![...locks.values()].some(Boolean)) return true;
    const record = await readDependencyInstallRecord(container);
    if (record?.version !== 1 || record.copyId !== copyId || record.status !== 'complete') return false;
    const current = dependencyInputHashes(manifest, locks);
    if (record.manifestSha256 !== current.manifestSha256 ||
        INSTALL_LOCKFILES.some((name) => record.lockHashes?.[name] !== current.lockHashes[name])) {
        return false;
    }
    if (!needsPackages) return true;
    try {
        const modulesPath = path.join(root, 'node_modules');
        const modules = await fsp.lstat(modulesPath);
        if (!modules.isDirectory() || modules.isSymbolicLink()) return false;
        for (const section of ['dependencies', 'devDependencies']) {
            for (const name of Object.keys(pkg[section] ?? {})) {
                const target = path.resolve(modulesPath, name);
                if (!isPathWithin(modulesPath, target) || name.includes('\\')) return false;
                await fsp.lstat(target);
            }
        }
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') return false;
        throw err;
    }
}

function isPathWithin(parent, child) {
    return child === parent || child.startsWith(parent + path.sep);
}

async function privateInstallCache(container) {
    const st = await fsp.lstat(container);
    if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077) ||
        await fsp.realpath(container) !== container) {
        throw new Error('Private working copy container is unsafe.');
    }
    const cache = path.join(container, 'bun-cache');
    try { await fsp.mkdir(cache, { mode: 0o700 }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
    const cacheStat = await fsp.lstat(cache);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink() ||
        await fsp.realpath(cache) !== cache || (cacheStat.mode & 0o077)) {
        throw new Error('Private Bun cache is unsafe.');
    }
    return cache;
}

// Bun may link workspace packages or its global store into node_modules.
// Check every reachable symlink before the project's dev script can run.
async function verifyDependencyLinks(root, cache) {
    const [realRoot, realCache] = await Promise.all([fsp.realpath(root), fsp.realpath(cache)]);
    const modules = path.join(root, 'node_modules');
    try { await fsp.lstat(modules); }
    catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
    }
    const visited = new Set();
    let entries = 0;
    const visit = async (directory) => {
        const real = await fsp.realpath(directory);
        if (!isPathWithin(realRoot, real) && !isPathWithin(realCache, real)) {
            throw new Error('Dependencies contain a link outside the private working copy and Bun cache.');
        }
        if (visited.has(real)) return;
        visited.add(real);
        const items = await fsp.readdir(real, { withFileTypes: true });
        for (const item of items) {
            if (++entries > INSTALL_MAX_SCAN_ENTRIES) throw new Error('Too many dependency files to verify safely.');
            const target = path.join(real, item.name);
            if (item.isSymbolicLink()) {
                let resolved;
                try { resolved = await fsp.realpath(target); }
                catch { throw new Error('Dependencies contain a broken link.'); }
                if (!isPathWithin(realRoot, resolved) && !isPathWithin(realCache, resolved)) {
                    throw new Error('Dependencies contain a link outside the private working copy and Bun cache.');
                }
                if ((await fsp.stat(target)).isDirectory()) await visit(resolved);
            } else if (item.isDirectory()) {
                await visit(target);
            }
        }
    };
    await visit(modules);
}

async function regularProjectFile(root, name) {
    const file = path.join(root, name);
    await rejectSymlinkPath(root, file);
    try {
        const st = await fsp.lstat(file);
        if (!st.isFile() || st.isSymbolicLink()) throw new Error(`Unsafe ${name}.`);
        if (st.size > 32 * 1024 * 1024) throw new Error(`${name} is too large to verify safely.`);
        return (await currentFile(file)).bytes;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

function stopWindowsChildTree(child) {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    // This PID belongs to a ChildProcess spawned by this bridge. Windows does
    // not terminate descendants when its parent exits; target only that tree.
    return new Promise((resolve) => {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true, timeout: 5000 }, (err) => {
                if (err && child.exitCode === null && child.signalCode === null) {
                    try { child.kill('SIGKILL'); } catch { /* already exited */ }
                }
                resolve();
            });
    });
}

function stopDependencyChild(child) {
    if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    if (process.platform === 'win32') return stopWindowsChildTree(child);
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        try { child.kill('SIGKILL'); } catch { /* already exited */ }
    }
    return Promise.resolve();
}

async function installDependencies(root, base = privateWorkingCopyBase()) {
    let canonical;
    let reserved = false;
    let cancelled = false;
    try {
        if (localShuttingDown) return { error: 'Weblab is closing.' };
        canonical = await requirePrivateWorkingRoot(root, base);
        await assertPrivateCredentialsAbsent(canonical);
        if (dependencyInstalls.size) return { error: 'Another dependency install is already running.' };
        if (devServers.has(canonical) || startingDevServers.has(canonical)) {
            return { error: 'Stop the local preview before installing dependencies.' };
        }
        dependencyInstalls.set(canonical, { cancel: () => { cancelled = true; } });
        reserved = true;
        const container = privateWorkingCopyRecords.get(canonical)?.container;
        const copyId = privateWorkingCopyRecords.get(canonical)?.record.copyId;
        if (!container || !copyId) return { error: 'Private working copy registration is missing.' };
        const previous = await readDependencyInstallRecord(container);
        if (previous?.status === 'pending' &&
            (previous.copyId !== copyId || installProcessMayBeRunning(previous.childPid))) {
            return { error: 'An interrupted install may still be running. Quit and reopen Weblab, then reopen the source folder for a fresh private copy. If you have Weblab edits, export their Git patch, apply it in your Git client, then reopen.' };
        }
        if (previous?.generatedLockOwner) {
            if (previous.version !== 1 || previous.copyId !== copyId || previous.status !== 'pending') {
                return { error: 'Private generated lock record is inconsistent.' };
            }
            await removeOwnedInstallLock(canonical, container, previous.generatedLockOwner, true);
        }
        await removeInterruptedInstallTemps(container);
        const manifest = await regularProjectFile(canonical, 'package.json');
        if (!manifest || !manifest.length || manifest.length > 1024 * 1024) {
            return { error: 'A readable package.json is required to install dependencies.' };
        }
        let pkg;
        try { pkg = JSON.parse(manifest.toString('utf8')); }
        catch { return { error: 'package.json is invalid.' }; }
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
            return { error: 'package.json must contain an object.' };
        }
        const lockFiles = new Map(await Promise.all(INSTALL_LOCKFILES.map(async (name) =>
            [name, await regularProjectFile(canonical, name)])));
        let lock;
        try { lock = classifyDependencyLockfiles(pkg, lockFiles); }
        catch (err) { return { error: err.message }; }
        const cache = await privateInstallCache(container);
        const temp = await fsp.mkdtemp(path.join(container, 'install-'));
        const home = path.join(temp, 'home');
        const tmp = path.join(temp, 'tmp');
        let generatedLockOwner = null;
        let installCompleted = false;
        try {
            await Promise.all([home, tmp].map((dir) => fsp.mkdir(dir, { mode: 0o700 })));
            const source = syncedEnv();
            const bunExecutable = await localBunExecutable();
            const env = {
                PATH: [path.isAbsolute(bunExecutable) ? path.dirname(bunExecutable) : null,
                    source.PATH || ''].filter(Boolean).join(path.delimiter),
                HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
                BUN_INSTALL_CACHE_DIR: cache, CI: '1',
            };
            if (process.platform === 'win32') {
                for (const key of ['SystemRoot', 'WINDIR', 'PATHEXT', 'ComSpec']) {
                    if (source[key]) env[key] = source[key];
                }
                env.USERPROFILE = home;
                env.APPDATA = path.join(home, 'AppData');
                env.LOCALAPPDATA = path.join(home, 'LocalAppData');
            }
            if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
            await verifyDependencyLinks(canonical, cache);
            await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                version: 1, copyId, status: 'pending', ...dependencyInputHashes(manifest, lockFiles),
            });
            const runBun = async (args, label, cwd = canonical) => {
                if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
                const pending = await readDependencyInstallRecord(container);
                await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                    ...pending, status: 'pending', childPid: null,
                });
                if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
                const child = spawn(bunExecutable, args, {
                    cwd, env, shell: false, detached: process.platform !== 'win32',
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                let output = '';
                let outputBytes = 0;
                let failure = '';
                let stopping = null;
                const stop = () => (stopping ??= stopDependencyChild(child));
                dependencyInstalls.set(canonical, {
                    child, cancel: () => { cancelled = true; failure = 'Dependency install cancelled.'; return stop(); },
                });
                const collect = (chunk) => {
                    outputBytes += chunk.length;
                    if (output.length < INSTALL_DETAILS_BYTES) {
                        output += chunk.toString('utf8').slice(0, INSTALL_DETAILS_BYTES - output.length);
                    }
                    if (outputBytes > INSTALL_MAX_OUTPUT_BYTES && !failure) {
                        failure = `${label} produced too much output.`;
                        stop();
                    }
                };
                child.stdout.on('data', collect);
                child.stderr.on('data', collect);
                let timer;
                let launchError;
                const outcomePromise = new Promise((resolve) => {
                    timer = setTimeout(() => {
                        failure = `${label} timed out after 3 minutes.`;
                        stop();
                    }, INSTALL_TIMEOUT_MS);
                    child.once('error', (err) => { launchError = err.code === 'ENOENT'
                        ? 'Bun is not available on this computer. Install Bun, then retry dependency setup.'
                        : `Could not start Bun: ${err.message}`; });
                    child.once('close', (code) => resolve({ code, error: launchError }));
                });
                try {
                    await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                        ...pending, status: 'pending', childPid: child.pid ?? null,
                    });
                } catch (err) {
                    await stop();
                    await outcomePromise;
                    clearTimeout(timer);
                    throw err;
                }
                const outcome = await outcomePromise;
                clearTimeout(timer);
                if (stopping) await stopping;
                if (failure) return { error: failure, details: output };
                if (outcome.error) return outcome;
                if (outcome.code !== 0) return { error: `${label} failed (exit ${outcome.code}).`, details: output };
                return { success: true };
            };
            if (lock.foreign) {
                const migrationRoot = path.join(temp, 'migration');
                await fsp.mkdir(migrationRoot, { mode: 0o700 });
                await Promise.all([
                    fsp.writeFile(path.join(migrationRoot, 'package.json'), manifest, { flag: 'wx', mode: 0o600 }),
                    fsp.writeFile(path.join(migrationRoot, lock.name), lockFiles.get(lock.name), { flag: 'wx', mode: 0o600 }),
                ]);
                const migrated = await runBun(['pm', 'migrate'], 'Bun lock migration', migrationRoot);
                if (migrated.error) return migrated;
                if (!(await regularProjectFile(migrationRoot, 'package.json'))?.equals(manifest) ||
                    !(await regularProjectFile(migrationRoot, lock.name))?.equals(lockFiles.get(lock.name))) {
                    return { error: 'Bun migration changed package.json or the original lockfile.' };
                }
                const generated = await regularProjectFile(migrationRoot, 'bun.lock');
                if (!generated?.length) return { error: 'Bun did not produce a migrated lockfile.' };
                const generatedText = generated.toString('utf8');
                if (lock.integrities.some((integrity) => !generatedText.includes(integrity))) {
                    return { error: 'Migrated Bun lock does not preserve every source package integrity pin.' };
                }
                const tempName = `generated-bun-lock-${randomUUID()}.tmp`;
                const stagedLock = path.join(container, tempName);
                const target = path.join(canonical, 'bun.lock');
                const handle = await fsp.open(stagedLock, 'wx', 0o600);
                try {
                    await handle.writeFile(generated);
                    await handle.sync();
                    generatedLockOwner = {
                        ...installLockIdentity(await handle.stat({ bigint: true }), sha256(generated)), tempName,
                    };
                } finally {
                    await handle.close();
                }
                await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                    version: 1, copyId, status: 'pending',
                    ...dependencyInputHashes(manifest, lockFiles), generatedLockOwner,
                });
                await fsp.link(stagedLock, target);
            }
            const outcome = await runBun([
                'install', '--frozen-lockfile', '--no-save', '--ignore-scripts',
                '--cache-dir', cache, '--no-progress',
            ], 'Bun install');
            const manifestAfter = await regularProjectFile(canonical, 'package.json');
            const locksAfter = new Map(await Promise.all(INSTALL_LOCKFILES.map(async (name) =>
                [name, await regularProjectFile(canonical, name)])));
            if (!manifestAfter?.equals(manifest) || INSTALL_LOCKFILES.some((name) => {
                const before = lockFiles.get(name);
                const after = locksAfter.get(name);
                if (lock.foreign && name === 'bun.lock') return after === null || sha256(after) !== generatedLockOwner.hash;
                return before === null ? after !== null : !after?.equals(before);
            })) {
                return { error: 'Dependency install changed package.json or the lockfile set. Inspect the private copy before retrying.' };
            }
            if (outcome.error) return outcome;
            if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
            await privateInstallCache(container);
            await verifyDependencyLinks(canonical, cache);
            if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
            if (generatedLockOwner) {
                await removeOwnedInstallLock(canonical, container, generatedLockOwner);
                generatedLockOwner = null;
            }
            if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
            await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                version: 1, copyId, status: 'complete', ...dependencyInputHashes(manifest, lockFiles),
            });
            if (cancelled || localShuttingDown) return { error: 'Dependency install cancelled.' };
            installCompleted = true;
            return { success: true };
        } finally {
            try {
                if (generatedLockOwner) await removeOwnedInstallLock(canonical, container, generatedLockOwner, true);
                if (!installCompleted) {
                    await writePrivateJsonFile(container, INSTALL_RECORD_NAME, {
                        version: 1, copyId, status: 'failed', ...dependencyInputHashes(manifest, lockFiles),
                    });
                }
            } finally {
                await fsp.rm(temp, { recursive: true, force: true });
            }
        }
    } catch (err) {
        return { error: err.message || 'Dependency install failed.' };
    } finally {
        if (reserved) dependencyInstalls.delete(canonical);
    }
}

// --- Dev server ---------------------------------------------------------------
// Mirrors the port inference in apps/web/server/src/sandbox/index.ts so local
// and cloud agree on how a dev script's port is read.
function inferPortFromDevScript(devScript) {
    if (typeof devScript !== 'string') return null;
    const explicit =
        /(?:--port|-p|--listen|-l)\s+(?:tcp:\/\/[^:]+:)?(\d{2,5})\b/.exec(devScript)?.[1];
    const localhost = /(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{2,5})\b/.exec(devScript)?.[1];
    const raw = explicit ?? localhost;
    if (!raw) return null;
    const port = Number.parseInt(raw, 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

// --- Free-port selection ------------------------------------------------------
// Local projects must never collide with the Weblab editor's own dev server
// (:3000) or each other. We pick an uncommon, high, registered-range port and
// scan upward for a free one. Keep WEBLAB_LOCAL_BASE_PORT in sync with
// WEBLAB_LOCAL_DEFAULT_PORT in packages/constants/src/editor.ts.
const WEBLAB_LOCAL_BASE_PORT = 31847;
const PORT_SCAN_LIMIT = 256;
// Never hand out a well-known dev port even if momentarily free — they're the
// ports other tools (and the editor itself) expect to grab, so squatting on
// one invites a later collision.
const AVOID_PORTS = new Set([
    3000, 3001, 3002, 4000, 4173, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8888, 9000, 9229,
]);

// True if something is already listening on `host:port`. We use a CONNECT probe
// rather than a bind probe on purpose: Node sets SO_REUSEADDR on listeners, so
// two binds to the same port can BOTH succeed and falsely report "free". A
// successful TCP connect unambiguously means the port is taken.
function isPortInUseOn(port, host) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (inUse) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(inUse);
        };
        socket.setTimeout(700);
        socket.once('connect', () => done(true)); // someone is listening
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false)); // ECONNREFUSED → nothing there
        try {
            socket.connect(port, host);
        } catch {
            done(false);
        }
    });
}

// A port is free only if nothing is listening on either loopback family. Dev
// servers vary — `next dev` binds `::` dualstack (the "address already in use
// :::3000" case), `serve`/Vite bind 0.0.0.0 — and a dualstack listener answers
// on 127.0.0.1 too, so checking both 127.0.0.1 and ::1 catches every case.
async function canBindPort(port) {
    if (await isPortInUseOn(port, '127.0.0.1')) return false;
    return !(await isPortInUseOn(port, '::1'));
}

// Pick a free port. Honors `preferred` FIRST when it's bindable — even if it's
// a "common" port — because the editor's frame URL was built from it and some
// frameworks (Vite, static `serve`) bind their own port regardless of the PORT
// env, so second-guessing a free requested port would only cause a mismatch.
// Only when `preferred` is occupied do we scan upward from the uncommon base
// (skipping well-known ports), giving the "use the next one if occupied"
// behavior instead of crashing on EADDRINUSE.
async function findFreePort(preferred) {
    const pref =
        Number.isInteger(preferred) && preferred > 0 && preferred <= 65535 ? preferred : null;
    if (pref && (await canBindPort(pref))) return pref;
    for (let i = 0; i < PORT_SCAN_LIMIT; i++) {
        const p = WEBLAB_LOCAL_BASE_PORT + i;
        if (p > 65535) break;
        if (p === pref || AVOID_PORTS.has(p)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await canBindPort(p)) return p;
    }
    // Exhausted the uncommon range (absurd in practice). Fall back to the
    // preferred/base port; if it's occupied the dev server surfaces a clear
    // EADDRINUSE rather than us silently picking a wrong port.
    return pref ?? WEBLAB_LOCAL_BASE_PORT;
}

function probePort(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}`, (res) => {
            res.destroy();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

const devServers = new Map(); // root -> { child|server, port, url, output: string[] }

const STATIC_MIME_TYPES = new Map([
    ['.html', 'text/html; charset=utf-8'], ['.htm', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
    ['.mjs', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
    ['.gif', 'image/gif'], ['.ico', 'image/x-icon'], ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
    ['.wasm', 'application/wasm'], ['.txt', 'text/plain; charset=utf-8'],
]);
const STATIC_PRIVATE_SEGMENTS = new Set([
    '.git', '.weblab', 'node_modules', '.next', 'dist', 'build', 'coverage',
]);
const STATIC_MAX_FILE_BYTES = 25 * 1024 * 1024;

async function serveStaticProjectFile(root, port, request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.headers.host !== `localhost:${port}` &&
        request.headers.host !== `127.0.0.1:${port}`) {
        response.writeHead(403).end();
        return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }
    try {
        const pathname = new URL(request.url, `http://localhost:${port}`).pathname;
        const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
        const candidates = !relative || relative.endsWith('/')
            ? [`${relative}index.html`]
            : path.extname(relative) ? [relative] : [`${relative}.html`, `${relative}/index.html`];
        for (const candidate of candidates) {
            const segments = candidate.split('/');
            if (segments.some((part) => !part || part === '..' || part.startsWith('.') ||
                STATIC_PRIVATE_SEGMENTS.has(part) || part.includes('\\') || part.includes('\0')) ||
                path.basename(candidate) === 'package.json' ||
                !STATIC_MIME_TYPES.has(path.extname(candidate).toLowerCase())) continue;
            const abs = resolveWithin(root, candidate);
            try {
                await verifyExistingParent(root, abs);
                const handle = await fsp.open(abs, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
                let body;
                let size;
                try {
                    const stat = await handle.stat();
                    if (!stat.isFile() || stat.size > STATIC_MAX_FILE_BYTES) continue;
                    size = stat.size;
                    body = request.method === 'HEAD' ? null : await handle.readFile();
                } finally {
                    await handle.close();
                }
                response.writeHead(200, {
                    'Content-Type': STATIC_MIME_TYPES.get(path.extname(candidate).toLowerCase()),
                    'Content-Length': body?.length ?? size,
                });
                response.end(body);
                return;
            } catch (err) {
                if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
            }
        }
        response.writeHead(404).end();
    } catch {
        response.writeHead(404).end();
    }
}

async function startStaticPreview(root, requestedPort) {
    const requested = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
        ? requestedPort : null;
    const port = requested ?? await findFreePort(null);
    if (!(await canBindPort(port))) {
        return { error: `Local preview port ${port} is occupied. Free it, then retry.` };
    }
    const server = http.createServer((request, response) => {
        void serveStaticProjectFile(root, port, request, response).catch(() => response.destroy());
    });
    try {
        if (localShuttingDown) return { error: 'Weblab is closing.' };
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => {
                server.off('error', reject);
                resolve();
            });
        });
    } catch (err) {
        return { error: err.message || 'static_preview_start_failed' };
    }
    if (localShuttingDown) {
        await new Promise((resolve) => server.close(resolve));
        return { error: 'Weblab is closing.' };
    }
    const rec = { server, port, url: `http://localhost:${port}`, output: [] };
    devServers.set(root, rec);
    server.once('close', () => { if (devServers.get(root) === rec) devServers.delete(root); });
    return { port, url: rec.url };
}

function isDevServerRunning(rec) {
    return !!(rec && (rec.server?.listening ||
        (rec.child && rec.child.exitCode === null && rec.child.signalCode === null)));
}

async function startDevServer(root, command, requestedPort, getWebContents) {
    const ownStart = !startingDevServers.has(root);
    if (ownStart) startingDevServers.add(root);
    try { return await startDevServerUnlocked(root, command, requestedPort, getWebContents); }
    finally { if (ownStart) startingDevServers.delete(root); }
}

async function startDevServerUnlocked(root, command, requestedPort, getWebContents) {
    try {
        if (privateWorkingCopyRecords.has(root)) await assertRetainedSanitySiteReady(root);
        else if (path.basename(root) === 'project') {
            // Also block interrupted setup after restart, before private registration.
            const retained = await readSiteInstall(path.dirname(root), path.basename(path.dirname(root)));
            if (retained) {
                if (retained.install.status !== 'complete') throw new Error('Sanity website setup needs recovery before preview.');
                await verifyIncomingSiteSourceInventory(root, retained.artifact, retained, retained.history);
            }
        }
        await assertPrivateCredentialsAbsent(root);
    }
    catch (error) { return { error: error.message }; }
    const existing = devServers.get(root);
    if (isDevServerRunning(existing)) {
        return { port: existing.port, url: existing.url };
    }
    // Opening a folder never runs a package manager or project script. The
    // renderer offers separate install and preview actions.
    let pkg = null;
    try {
        await rejectSymlinkPath(root, path.join(root, 'package.json'));
        pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
        if (!pkg || typeof pkg !== 'object') throw new Error('invalid_package_json');
    } catch (err) {
        if (err.code !== 'ENOENT') {
            return { error: 'A readable package.json is required to start this local preview.' };
        }
    }
    const devScript = pkg && typeof pkg.scripts?.dev === 'string' ? pkg.scripts.dev : '';
    if (!devScript) {
        try {
            await verifyExistingParent(root, path.join(root, 'index.html'));
            const index = await fsp.lstat(path.join(root, 'index.html'));
            if (!index.isFile() || index.isSymbolicLink()) throw new Error('invalid_index_html');
        } catch {
            return { error: 'A package.json dev script or a root index.html is required to start this local preview.' };
        }
        return startStaticPreview(root, requestedPort);
    }
    const needsInstall = ['dependencies', 'devDependencies', 'optionalDependencies']
        .some((key) => pkg[key] && typeof pkg[key] === 'object' && Object.keys(pkg[key]).length > 0);
    if (needsInstall) {
        try {
            await fsp.stat(path.join(root, 'node_modules'));
        } catch {
            return { error: 'Dependencies are missing. Install them in this project folder, then start the preview again.' };
        }
    }
    // Bun runs predev/postdev automatically, while the source-mode preview
    // below runs only the requested dev script. Keep that contract when using
    // the packaged Bun runtime.
    if (app?.isPackaged && (pkg.scripts?.predev || pkg.scripts?.postdev)) {
        return { error: 'This project defines predev or postdev scripts. Run them outside Weblab or remove them from the private copy before preview.' };
    }
    const pinnedPort = inferPortFromDevScript(devScript);
    const requested =
        Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
            ? requestedPort
            : null;
    if (pinnedPort && requested && pinnedPort !== requested) {
        return {
            error: `The project's dev script now uses port ${pinnedPort}, but its saved preview uses ${requested}. Reopen the folder to update its preview port.`,
        };
    }
    // The renderer has already saved frame URLs using the requested port.
    // Fail visibly on collision instead of reporting a different port that
    // those frames will never load. A pinned CLI flag takes precedence over
    // PORT; the renderer will reconcile its URL after a successful start.
    const port = pinnedPort ?? requested ?? await findFreePort(null);
    if (!(await canBindPort(port))) {
        return { error: `Local preview port ${port} is occupied. Free it or change the project's dev-server port, then retry.` };
    }
    let child;
    try {
        const bunExecutable = app?.isPackaged ? await localBunExecutable() : null;
        if (localShuttingDown) return { error: 'Weblab is closing.' };
        child = spawn(bunExecutable || devScript, bunExecutable ? ['run', '--bun', '--no-install', 'dev'] : [], {
            cwd: root,
            // Pass PORT so frameworks that honor it (Next.js) bind the port the
            // editor's frame URL was built from. Scripts with an explicit flag
            // (the static-HTML scaffold's `serve -l <port>`) override it. Keeps
            // localhost:<port> on the canvas matching the actual dev server.
            env: projectDevEnvironment(root, port, bunExecutable),
            shell: !bunExecutable, // Bun runs the packaged script without an outer shell
            // New process group (POSIX) so stopDevServer can kill the shell AND
            // the dev server it spawns. Without this, shell:true leaves the real
            // dev server orphaned on close/switch, leaking processes + the port.
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (err) {
        return { error: (err && err.message) || 'spawn_failed' };
    }
    const rec = { child, port, url: `http://localhost:${port}`, output: [] };
    devServers.set(root, rec);
    const onData = (b) => {
        const s = b.toString();
        rec.output.push(s);
        if (rec.output.length > 500) rec.output.shift();
        const wc = getWebContents();
        if (wc) {
            try {
                wc.send('weblab:localdev:output', { root, data: s });
            } catch {
                // window may have closed
            }
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => { if (devServers.get(root) === rec) devServers.delete(root); });
    child.on('error', () => { if (devServers.get(root) === rec) devServers.delete(root); });

    // Wait until the dev server actually binds the port (cold compile 30-90s).
    const deadline = Date.now() + 90000;
    let listening = false;
    while (Date.now() < deadline) {
        if (devServers.get(root) !== rec) break; // crashed
        if (await probePort(port)) {
            listening = true;
            break;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    if (!listening) {
        if (devServers.get(root) === rec) await stopDevServer(root);
        // Keep the last dev-server output so the editor's Details view can
        // show why it stopped (a crash, a port clash, a missing env var).
        const tail = rec.output.join('').trim().slice(-1500);
        return { error: `Dev server did not bind port ${port}. Check its dev script and try again.${tail ? `\n\n${tail}` : ''}` };
    }
    return { port, url: rec.url };
}

// Wait for the child to exit before a restart can re-use its port. A stuck
// process returns a failure rather than silently selecting a new port.
async function stopDevServer(root, forceAfterTimeout = false) {
    const rec = devServers.get(root);
    if (!rec) return { success: true };
    if (rec.server) {
        if (!rec.server.listening) {
            if (devServers.get(root) === rec) devServers.delete(root);
            return { success: true };
        }
        const closed = new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), 3000);
            rec.server.close((err) => {
                clearTimeout(timer);
                resolve(!err);
            });
            rec.server.closeAllConnections?.();
        });
        const didClose = await closed;
        if (didClose && devServers.get(root) === rec) devServers.delete(root);
        return didClose ? { success: true } : { error: 'Static preview did not stop within 3 seconds.' };
    }
    const child = rec.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        if (devServers.get(root) === rec) devServers.delete(root);
        return { success: true };
    }
    const exited = new Promise((resolve) => {
        const done = (value) => {
            clearTimeout(timer);
            child.off('exit', onExit);
            child.off('error', onExit);
            resolve(value);
        };
        const onExit = () => done(true);
        const timer = setTimeout(() => done(false), process.platform === 'win32' ? 6000 : 3000);
        child.once('exit', onExit);
        child.once('error', onExit);
    });
    if (child.pid) {
        try {
            if (process.platform === 'win32') {
                await stopWindowsChildTree(child);
            } else {
                // Negative pid → kill the whole process group (shell + the dev
                // server it spawned), so nothing is orphaned holding the port.
                process.kill(-rec.child.pid, 'SIGTERM');
            }
        } catch {
            try {
                rec.child.kill();
            } catch {
                // already gone
            }
        }
    }
    let didExit = await exited;
    if (!didExit && forceAfterTimeout && process.platform !== 'win32' && child.pid &&
        child.exitCode === null && child.signalCode === null) {
        // Shutdown-only escalation. Recheck that this owned ChildProcess is
        // still live before signaling its detached process group again.
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch { try { child.kill('SIGKILL'); } catch { /* already exited */ } }
        didExit = await new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
            const timer = setTimeout(() => resolve(false), 3000);
            child.once('exit', () => { clearTimeout(timer); resolve(true); });
            child.once('error', () => { clearTimeout(timer); resolve(true); });
        });
    }
    if (didExit && devServers.get(root) === rec) devServers.delete(root);
    if (!didExit) return { error: 'Dev server did not stop. Wait for it to exit before restarting.' };
    for (let attempt = 0; attempt < 12; attempt++) {
        if (!(await probePort(rec.port))) return { success: true };
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { error: 'Dev server did not release its port. Wait for it to stop before restarting.' };
}

function git(args, root, timeout = 0, maxBuffer = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const env = { ...syncedEnv() };
        for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
        execFile('git', args, { cwd: root, env, encoding: 'buffer', maxBuffer, timeout },
            (err, stdout) => {
                if (err) return reject(err);
                try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); }
                catch { reject(new Error('git_path_invalid_utf8')); }
            });
    });
}

async function gitInfo(root) {
    try {
        const top = (await git(['rev-parse', '--show-toplevel'], root)).trim();
        if (await fsp.realpath(top) !== root) return { isRepositoryRoot: false };
        const branch = (await git(['branch', '--show-current'], root)).trim();
        return { isRepositoryRoot: true, branch: branch || undefined };
    } catch (err) {
        if (err.code === 128) return { isRepositoryRoot: false };
        return { isRepositoryRoot: false, error: err.message };
    }
}

async function gitStatus(root) {
    try {
        if (!(await gitInfo(root)).isRepositoryRoot) return { changedFiles: [], error: 'not_repository_root' };
        const output = await git(['--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], root);
        const records = output.split('\0');
        const changedFiles = [];
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            if (!record) continue;
            changedFiles.push(record.slice(3));
            if ('RC'.includes(record[0]) || 'RC'.includes(record[1])) i++;
        }
        return { changedFiles };
    } catch (err) {
        return { changedFiles: [], error: err.message };
    }
}

async function gitHead(root) {
    try { return (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--verify', 'HEAD'], root)).trim(); }
    catch (err) {
        if (err.code === 128) return null; // unborn repository
        throw err;
    }
}

// An original Git project is never a renderer mutation target. The editor
// works in one persistent, private copy per source root; handoff can later
// compare its immutable baseline with both trees.
const PRIVATE_COPY_MAX_FILES = 50000;
const PRIVATE_COPY_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const PRIVATE_COPY_MAX_BASELINE_BYTES = 100 * 1024 * 1024;
const PRIVATE_COPY_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const PRIVATE_COPY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASELINE_TEXT_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.css', '.scss',
    '.sass', '.html', '.htm', '.md', '.mdx', '.txt', '.svg', '.yaml',
    '.yml', '.toml', '.xml',
]);
const BASELINE_TEXT_FILENAMES = new Set([
    'README', 'LICENSE', '.gitignore', '.prettierrc', '.eslintrc',
]);
const privateWorkingRoots = new Set();
const privateWorkingCopyRecords = new Map(); // root -> { sourceRootPath, record, container }
let privateCopyQueue = Promise.resolve();

function privateWorkingCopyBase() {
    const parent = app?.getPath ? app.getPath('userData') : os.tmpdir();
    return path.join(parent, 'weblab-private-working-copies');
}

function isBaselineTextPath(rel) {
    return BASELINE_TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase()) ||
        BASELINE_TEXT_FILENAMES.has(path.basename(rel));
}

function sameSnapshotStat(left, right) {
    return left.dev === right.dev && left.ino === right.ino &&
        left.mode === right.mode && left.size === right.size &&
        left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function preparePrivateCopyBase(base) {
    await fsp.mkdir(base, { recursive: true, mode: 0o700 });
    const st = await fsp.lstat(base);
    if (!st.isDirectory() || st.isSymbolicLink() || await fsp.realpath(base) !== path.resolve(base)) {
        throw new Error('unsafe_private_copy_directory');
    }
    await fsp.chmod(base, 0o700);
}

async function readPrivateCopyIndex(base) {
    const indexPath = path.join(base, 'index.json');
    try {
        const stat = await fsp.lstat(indexPath);
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) {
            throw new Error('unsafe_private_copy_index');
        }
        const parsed = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
        if (parsed.version !== 1 || !parsed.copies || typeof parsed.copies !== 'object' ||
            Array.isArray(parsed.copies)) throw new Error('invalid_private_copy_index');
        if (parsed.retired === undefined) parsed.retired = {};
        if (!parsed.retired || typeof parsed.retired !== 'object' || Array.isArray(parsed.retired)) {
            throw new Error('invalid_private_copy_index');
        }
        for (const [source, record] of Object.entries(parsed.copies)) {
            if (!path.isAbsolute(source) || !record || !PRIVATE_COPY_ID.test(record.copyId) ||
                !/^[a-f0-9]{64}$/.test(record.manifestSha256)) {
                throw new Error('invalid_private_copy_index');
            }
        }
        for (const [id, record] of Object.entries(parsed.retired)) {
            if (!PRIVATE_COPY_ID.test(id) || !record || record.copyId !== id ||
                !path.isAbsolute(record.sourceRootPath) ||
                !/^[a-f0-9]{64}$/.test(record.manifestSha256)) {
                throw new Error('invalid_private_copy_index');
            }
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') return { version: 1, copies: {}, retired: {} };
        throw err;
    }
}

async function writePrivateCopyIndex(base, index) {
    const target = path.join(base, 'index.json');
    const temporary = path.join(base, `${randomUUID()}.index.tmp`);
    try {
        const handle = await fsp.open(temporary, 'wx', 0o600);
        try {
            await handle.writeFile(JSON.stringify(index));
            await handle.sync();
        } finally {
            await handle.close();
        }
        await fsp.rename(temporary, target);
        const dir = await fsp.open(base, fsConstants.O_RDONLY);
        try { await dir.sync(); }
        finally { await dir.close(); }
    } finally {
        await fsp.rm(temporary, { force: true });
    }
}

async function writePrivateJsonFile(directory, name, value, mode = 0o600, assertActive) {
    const target = path.join(directory, name);
    const temporary = path.join(directory, `${randomUUID()}.${name}.tmp`);
    try {
        const handle = await fsp.open(temporary, 'wx', mode);
        try {
            await handle.writeFile(JSON.stringify(value));
            await handle.sync();
        } finally {
            await handle.close();
        }
        assertSiteInstallActive(assertActive);
        await fsp.rename(temporary, target);
        const dir = await fsp.open(directory, fsConstants.O_RDONLY);
        try { await dir.sync(); }
        finally { await dir.close(); }
    } finally {
        await fsp.rm(temporary, { force: true });
    }
}

async function readPrivateJournal(container, copyId) {
    const journalPath = path.join(container, 'write-journal.json');
    const stat = await fsp.lstat(journalPath);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) {
        throw new Error('Private working copy write journal is unsafe.');
    }
    const bytes = await fsp.readFile(journalPath);
    const journal = JSON.parse(bytes.toString('utf8'));
    if (journal.version !== 1 || journal.copyId !== copyId || !Array.isArray(journal.writes)) {
        throw new Error('Private working copy write journal is invalid.');
    }
    const seen = new Set();
    for (const entry of journal.writes) {
        if (typeof entry.path !== 'string' || !entry.path || entry.path.startsWith('/') ||
            entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
            (entry.sha256 !== null && !/^[a-f0-9]{64}$/.test(entry.sha256)) ||
            seen.has(entry.path)) throw new Error('Private working copy write journal is invalid.');
        seen.add(entry.path);
    }
    if (journal.intent !== undefined && journal.intent !== null) {
        const intent = journal.intent;
        if (typeof intent.path !== 'string' || !intent.path || intent.path.startsWith('/') ||
            intent.path.split('/').some((part) => !part || part === '.' || part === '..') ||
            (intent.beforeSha256 !== null && !/^[a-f0-9]{64}$/.test(intent.beforeSha256)) ||
            (intent.desiredSha256 !== null && !/^[a-f0-9]{64}$/.test(intent.desiredSha256))) {
            throw new Error('Private working copy write intent is invalid.');
        }
    }
    return { journal, hash: sha256(bytes) };
}

async function privateCopyRecordForRoot(root, base = privateWorkingCopyBase()) {
    const index = await readPrivateCopyIndex(base);
    const found = [
        ...Object.entries(index.copies),
        ...Object.values(index.retired).map((item) => [item.sourceRootPath, item]),
    ].find(([, item]) => path.join(base, item.copyId, 'project') === root);
    if (!found) throw new Error('original_git_root_is_read_only');
    const [sourceRootPath, record] = found;
    const manifest = await readPrivateCopyManifest(base, sourceRootPath, record);
    const container = path.join(base, record.copyId);
    privateWorkingCopyRecords.set(root, { sourceRootPath, record, container });
    return { sourceRootPath, record, manifest, container };
}


const journalLeaseContext = new AsyncLocalStorage();
const cliTurnContext = new AsyncLocalStorage();
const activeCliRoots = new Set();
const quarantinedCliRoots = new Set();

function sameLockStat(left, right) {
    return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
        left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function readJournalLock(lockPath) {
    const initial = await fsp.lstat(lockPath, { bigint: true });
    if (!initial.isFile() || initial.isSymbolicLink()) throw new Error('Unsafe private journal lock.');
    const handle = await fsp.open(lockPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
        const stat = await handle.stat({ bigint: true });
        if (!sameLockStat(initial, stat) || !sameLockStat(stat, await fsp.lstat(lockPath, { bigint: true }))) {
            throw new Error('Private journal lock changed. Try again.');
        }
        if (!stat.isFile() || stat.size > 1024n || (stat.mode & 0o077n)) {
            throw new Error('Private journal lock needs manual recovery.');
        }
        let owner;
        try { owner = JSON.parse(await handle.readFile('utf8')); }
        catch { throw new Error('Private journal lock needs manual recovery.'); }
        if (owner?.version !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
            typeof owner.processStart !== 'string' || !owner.processStart ||
            typeof owner.nonce !== 'string' || !PRIVATE_COPY_ID.test(owner.nonce)) {
            throw new Error('Private journal lock needs manual recovery.');
        }
        return { stat, owner };
    } finally { await handle.close(); }
}

async function recoverDeadJournalLock(lockPath, readTable = readProcessTable) {
    const { stat, owner } = await readJournalLock(lockPath);
    const current = (await readTable()).get(owner.pid);
    if (current?.start === owner.processStart) throw new Error('A private write is still in progress.');
    const latest = await fsp.lstat(lockPath, { bigint: true });
    if (!sameLockStat(stat, latest)) throw new Error('Private journal lock changed. Try again.');
    await fsp.unlink(lockPath);
}

/** Publish a complete owner record; never expose an empty recoverable lock. */
async function acquireJournalLease(container, readTable = readProcessTable) {
    const identity = (await readTable()).get(process.pid);
    if (!identity?.start) throw new Error('Private journal owner identity is unavailable.');
    const owner = { version: 1, pid: process.pid, processStart: identity.start, nonce: randomUUID() };
    const lockPath = path.join(container, 'write-journal.lock');
    const temporary = path.join(container, owner.nonce + '.journal-lock.tmp');
    const handle = await fsp.open(temporary, 'wx', 0o600);
    try {
        await handle.writeFile(JSON.stringify(owner));
        await handle.sync();
    } finally { await handle.close(); }
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await fsp.link(temporary, lockPath);
                await fsp.unlink(temporary);
                const published = await readJournalLock(lockPath);
                return async () => {
                    const current = await readJournalLock(lockPath);
                    if (!sameLockStat(published.stat, current.stat) ||
                        current.owner.pid !== owner.pid ||
                        current.owner.processStart !== owner.processStart ||
                        current.owner.nonce !== owner.nonce) {
                        throw new Error('Private journal lock ownership changed.');
                    }
                    const latest = await fsp.lstat(lockPath, { bigint: true });
                    if (!sameLockStat(current.stat, latest)) throw new Error('Private journal lock changed.');
                    await fsp.unlink(lockPath);
                };
            } catch (error) {
                if (error.code !== 'EEXIST') throw error;
                if (attempt) throw new Error('A private write is still in progress.');
                await recoverDeadJournalLock(lockPath, readTable);
            }
        }
        throw new Error('Private journal lock could not be acquired.');
    } finally { await fsp.rm(temporary, { force: true }); }
}

async function withJournalLease(root, base, operation) {
    const active = journalLeaseContext.getStore();
    if (active?.root === root && active.active) return operation();
    const { container } = privateWorkingCopyRecords.get(root) ?? await privateCopyRecordForRoot(root, base);
    await checkCliCleanup(root, container);
    const release = await acquireJournalLease(container);
    const context = { root, container, active: true };
    try { return await journalLeaseContext.run(context, operation); }
    finally { context.active = false; await release(); }
}

async function quarantineCliCleanup(root, failure, base = privateWorkingCopyBase()) {
    quarantinedCliRoots.add(root); // Keep blocked even if durable recording fails.
    const { container, record } = privateWorkingCopyRecords.get(root) ?? await privateCopyRecordForRoot(root, base);
    const identities = Array.isArray(failure?.identities) ? failure.identities.filter((entry) =>
        Number.isSafeInteger(entry?.pid) && entry.pid > 0 && typeof entry.start === 'string' && entry.start) : [];
    await writePrivateJsonFile(container, 'cli-cleanup.json', {
        version: 1, copyId: record.copyId, identities, unobserved: failure?.unobserved !== false,
    });
}

/** Own one durable turn and one journal lease before any adapter can spawn. */
async function withCliTurn(root, operation, base = privateWorkingCopyBase()) {
    root = await requirePrivateWorkingRoot(root, base);
    await assertPrivateCredentialsAbsent(root);
    await assertNoPendingSiteInstall(root, base);
    return withJournalLease(root, base, async () => {
        const { container, record } = privateWorkingCopyRecords.get(root) ??
            await privateCopyRecordForRoot(root, base);
        await assertNoPendingSiteInstall(root, base);
        return withCliTurnMarker(root, container, record.copyId, operation);
    });
}

async function withCliTurnMarker(root, container, copyId, operation, {
    persist = writePrivateJsonFile, readTable = readProcessTable,
} = {}) {
    const identity = (await readTable()).get(process.pid);
    if (identity?.pid !== process.pid || !identity.start) throw new Error('AI turn ownership could not be verified.');
    const owner = { root, nonce: randomUUID(), active: true };
    const marker = { version: 1, copyId, status: 'active', nonce: owner.nonce,
        owner: { pid: identity.pid, start: identity.start },
        // A process can spawn descendants between observations. After a crash,
        // owner death alone cannot prove that every descendant has exited.
        identities: [], unobserved: true };
    try {
        activeCliRoots.add(root);
        await persist(container, 'cli-cleanup.json', marker);
        const result = await cliTurnContext.run(owner, operation);
        // Successful operation means adapter cleanup AND complete journaling.
        const file = path.join(container, 'cli-cleanup.json');
        const initial = await fsp.lstat(file, { bigint: true });
        if (!initial.isFile() || initial.isSymbolicLink()) throw new Error('Unsafe AI ownership record.');
        const handle = await fsp.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
        try {
            const stat = await handle.stat({ bigint: true });
            if (!stat.isFile() || stat.size > 64_000n || (stat.mode & 0o077n)) {
                throw new Error('AI ownership record needs manual recovery.');
            }
            const current = JSON.parse(await handle.readFile('utf8'));
            if (!sameLockStat(initial, stat) || !sameLockStat(stat, await fsp.lstat(file, { bigint: true })) ||
                current.version !== 1 || current.status !== 'active' || current.nonce !== owner.nonce ||
                current.copyId !== copyId || current.owner?.pid !== marker.owner.pid ||
                current.owner?.start !== marker.owner.start || current.unobserved !== true) {
                throw new Error('AI ownership record changed. This copy needs recovery.');
            }
            await fsp.unlink(file);
            const dir = await fsp.open(container, fsConstants.O_RDONLY);
            try { await dir.sync(); } finally { await dir.close(); }
        } finally { await handle.close(); }
        return result;
    } catch (error) {
        quarantinedCliRoots.add(root);
        // Keep the initial unknown marker on failure. Never replace it with a
        // captured subset that could mistakenly authorize crash recovery.
        const failure = new Error(error instanceof Error ? error.message : String(error), { cause: error });
        failure.code = 'cleanup_unconfirmed';
        failure.unobserved = true;
        throw failure;
    } finally { owner.active = false; activeCliRoots.delete(root); }
}

async function checkCliCleanup(root, container, { readTable = readProcessTable } = {}) {
    const file = path.join(container, 'cli-cleanup.json');
    let handle;
    let initial;
    try {
        initial = await fsp.lstat(file, { bigint: true });
        if (!initial.isFile() || initial.isSymbolicLink()) throw new Error('Unsafe CLI cleanup record.');
        handle = await fsp.open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (quarantinedCliRoots.has(root) || activeCliRoots.has(root)) {
            throw new Error('CLI cleanup needs recovery before editing this copy.');
        }
        return;
    }
    let stat;
    let record;
    try {
        stat = await handle.stat({ bigint: true });
        if (!sameLockStat(initial, stat) || !sameLockStat(stat, await fsp.lstat(file, { bigint: true }))) {
            throw new Error('CLI cleanup record changed. Try again.');
        }
        if (!stat.isFile() || stat.size > 64_000n || (stat.mode & 0o077n)) {
            throw new Error('CLI cleanup record needs manual recovery.');
        }
        record = JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
    const ownTurn = cliTurnContext.getStore();
    if (record?.version === 1 && record.copyId === path.basename(container) &&
        record.status === 'active' && ownTurn?.active && ownTurn.root === root &&
        record.nonce === ownTurn.nonce && !quarantinedCliRoots.has(root)) return;
    if (record?.status === 'active') {
        throw new Error('An interrupted AI turn needs manual recovery before editing this copy.');
    }
    if (record?.version !== 1 || record.copyId !== path.basename(container) ||
        record.unobserved !== false || !Array.isArray(record.identities) || !record.identities.length ||
        record.identities.some((entry) => !Number.isSafeInteger(entry?.pid) || entry.pid <= 0 ||
            typeof entry.start !== 'string' || !entry.start)) {
        throw new Error('CLI cleanup needs manual recovery before editing this copy.');
    }
    const table = await readTable();
    if (record.identities.some((entry) => table.get(entry.pid)?.start === entry.start)) {
        throw new Error('An AI process is still running. This copy is paused until cleanup finishes.');
    }
    if (!sameLockStat(stat, await fsp.lstat(file, { bigint: true }))) {
        throw new Error('CLI cleanup record changed. Try again.');
    }
    await fsp.unlink(file);
    quarantinedCliRoots.delete(root);
}

async function recordPrivateWrite(root, rel, hash, base = privateWorkingCopyBase()) {
    const normalized = path.relative(root, resolveWithin(root, rel)).split(path.sep).join('/');
    if (!normalized || normalized.startsWith('.git/') || normalized === '.git') {
        throw new Error('Cannot journal a Git metadata write.');
    }
    const { record, container } = privateWorkingCopyRecords.get(root) ??
        await privateCopyRecordForRoot(root, base);
    return withJournalLease(root, base, async () => {
        const { journal } = await readPrivateJournal(container, record.copyId);
        if (journal.intent) throw new Error('A private write intent needs reconciliation.');
        const next = journal.writes.filter((item) => item.path !== normalized);
        next.push({ path: normalized, sha256: hash });
        next.sort((a, b) => a.path.localeCompare(b.path));
        await writePrivateJsonFile(container, 'write-journal.json', {
            version: 1, copyId: record.copyId, writes: next,
        });
    });
}

async function privatePathHash(root, rel) {
    const abs = resolveWithin(root, rel);
    rejectGitMetadataMutation(root, abs);
    await rejectSymlinkPath(root, abs);
    try { await verifyExistingParent(root, abs); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    return (await currentFile(abs)).hash;
}

async function reconcilePrivateWriteIntent(root, base = privateWorkingCopyBase()) {
    return withJournalLease(root, base, () => reconcilePrivateWriteIntentUnlocked(root, base));
}

async function reconcilePrivateWriteIntentUnlocked(root, base) {
    const { record, container } = privateWorkingCopyRecords.get(root) ??
        await privateCopyRecordForRoot(root, base);
    const { journal } = await readPrivateJournal(container, record.copyId);
    const intent = journal.intent;
    if (!intent) return;
    const actual = await privatePathHash(root, intent.path);
    if (actual !== intent.beforeSha256 && actual !== intent.desiredSha256) {
        throw new Error(`Private write intent is ambiguous for ${intent.path}. Recover the file before handoff.`);
    }
    const writes = journal.writes.filter((item) => item.path !== intent.path);
    if (actual === intent.desiredSha256) {
        writes.push({ path: intent.path, sha256: intent.desiredSha256 });
    } else {
        const prior = journal.writes.find((item) => item.path === intent.path);
        if (prior) writes.push(prior);
    }
    writes.sort((a, b) => a.path.localeCompare(b.path));
    await writePrivateJsonFile(container, 'write-journal.json', {
        version: 1, copyId: record.copyId, writes, intent: null,
    });
}

async function beginPrivateWriteIntent(root, rel, beforeSha256, desiredSha256, base = privateWorkingCopyBase()) {
    return withJournalLease(root, base, () =>
        beginPrivateWriteIntentUnlocked(root, rel, beforeSha256, desiredSha256, base));
}

async function beginPrivateWriteIntentUnlocked(root, rel, beforeSha256, desiredSha256, base) {
    await assertNoPendingSiteInstall(root, base);
    await reconcilePrivateWriteIntent(root, base);
    const actual = await privatePathHash(root, rel);
    if (actual !== beforeSha256) return { conflict: true, hash: actual };
    const { record, container } = privateWorkingCopyRecords.get(root) ??
        await privateCopyRecordForRoot(root, base);
    const { journal } = await readPrivateJournal(container, record.copyId);
    if (journal.intent) throw new Error('A private write intent needs reconciliation.');
    const normalized = path.relative(root, resolveWithin(root, rel)).split(path.sep).join('/');
    await writePrivateJsonFile(container, 'write-journal.json', {
        version: 1, copyId: record.copyId, writes: journal.writes,
        intent: { path: normalized, beforeSha256, desiredSha256 },
    });
    return { success: true };
}

// Main resolves an engine-retained handle. Renderer-supplied paths or bytes are never accepted.
const cmsInstallContext = new AsyncLocalStorage();
const CMS_INSTALL_MAX_BYTES = 100 * 1024 * 1024;

function sanitySiteEngine() { return require('./release/site-engine').requireSiteEngine('index'); }

function serializeSiteArtifact(artifact) {
    return { ...artifact, files: artifact.files.map((file) => ({ ...file, bytes: file.bytes.toString('base64') })) };
}

function restoreSiteArtifact(value) {
    if (!value || !Array.isArray(value.files) || value.files.length > 10_000) {
        throw new Error('Sanity website installation record is invalid.');
    }
    let total = 0;
    const files = value.files.map((file) => {
        if (typeof file?.bytes !== 'string') throw new Error('Sanity website retained bytes are invalid.');
        const bytes = Buffer.from(file.bytes, 'base64');
        if (bytes.toString('base64') !== file.bytes || bytes.length > 32 * 1024 * 1024) {
            throw new Error('Sanity website retained bytes are invalid.');
        }
        total += bytes.length;
        if (total > CMS_INSTALL_MAX_BYTES) throw new Error('Sanity website installation exceeds the size limit.');
        return { ...file, bytes };
    });
    const artifact = { ...value, files };
    sanitySiteEngine().validateMaterializedSiteArtifact(artifact);
    return artifact;
}

async function readSiteInstall(container, copyId, name = 'cms-install.json', loadHistory = true) {
    const file = await currentFile(path.join(container, name), 145 * 1024 * 1024);
    if (!file.bytes) return null;
    if (file.mode & 0o077) throw new Error('Sanity website installation record is unsafe.');
    const install = JSON.parse(file.bytes.toString('utf8'));
    if (install.version !== 1 || install.copyId !== copyId ||
        !['pending', 'conflicted', 'complete'].includes(install.status) ||
        !Array.isArray(install.completed) || !Array.isArray(install.history) || install.history.length > 20 ||
        !/^[a-f0-9]{64}$/.test(install.baselineHash) || !install.beforeBytes || typeof install.beforeBytes !== 'object') {
        throw new Error('Sanity website installation record is invalid.');
    }
    const artifact = restoreSiteArtifact(install.artifact);
    if ((install.requiresPreparation !== undefined && install.requiresPreparation !== true) ||
        (install.preparationSuccessor !== undefined && (install.preparationSuccessor !== true ||
            install.requiresPreparation !== true || !artifact.predecessor || install.status === 'complete'))) {
        throw new Error('Sanity website preparation gate is invalid.');
    }
    if (artifact.scope.rootPath !== path.join(container, 'project')) throw new Error('Sanity website retained scope belongs to another copy.');
    if (install.manifestHash !== artifact.manifestHash || install.profileHash !== artifact.profileHash ||
        install.captureId !== artifact.captureId || install.sourceHash !== artifact.sourceHash ||
        install.contentHash !== artifact.contentHash || install.draftHash !== artifact.draftHash) {
        throw new Error('Sanity website installation pins are invalid.');
    }
    const paths = new Set(artifact.files.map((entry) => entry.path));
    if (new Set(install.completed).size !== install.completed.length ||
        install.completed.some((rel) => !paths.has(rel)) ||
        Object.keys(install.beforeBytes).length !== paths.size) {
        throw new Error('Sanity website installation completion is invalid.');
    }
    for (const entry of artifact.files) {
        const bytes = install.beforeBytes[entry.path];
        if (entry.beforeSha256 === null ? bytes !== null : typeof bytes !== 'string' ||
            Buffer.from(bytes, 'base64').toString('base64') !== bytes ||
            sha256(Buffer.from(bytes, 'base64')) !== entry.beforeSha256) {
            throw new Error('Sanity website original bytes are invalid.');
        }
    }
    const baselineFile = await currentFile(path.join(container, 'cms-install-baseline.json'), 15 * 1024 * 1024);
    if (!baselineFile.bytes || baselineFile.mode & 0o077 || baselineFile.hash !== install.baselineHash) {
        throw new Error('Sanity website original baseline is invalid.');
    }
    const baseline = JSON.parse(baselineFile.bytes.toString('utf8'));
    if (![1, 2].includes(baseline.version) || baseline.copyId !== copyId || !baseline.sourceHashes || !baseline.originals) {
        throw new Error('Sanity website original baseline is invalid.');
    }
    for (const [rel, bytes] of Object.entries(baseline.originals)) {
        if (!cliJournalCandidates([rel]).includes(rel) || (baseline.version === 2 && bytes === null) || (bytes !== null && (typeof bytes !== 'string' ||
            Buffer.from(bytes, 'base64').toString('base64') !== bytes || sha256(Buffer.from(bytes, 'base64')) !== baseline.sourceHashes[rel]))) {
            throw new Error('Sanity website original baseline bytes are invalid.');
        }
    }
    const history = [];
    if (loadHistory) for (const [index, prior] of install.history.entries()) {
        if (!/^[a-f0-9]{64}$/.test(prior?.manifestHash) || !/^[a-f0-9]{64}$/.test(prior?.receiptSha256)) {
            throw new Error('Sanity website installation history is invalid.');
        }
        const previous = await readSiteInstall(container, copyId, `cms-install-${prior.manifestHash}.json`, false);
        if (!previous || previous.hash !== prior.receiptSha256 || previous.artifact.manifestHash !== prior.manifestHash ||
            previous.install.status !== 'complete' || previous.install.baselineHash !== install.baselineHash ||
            previous.install.completed.length !== previous.artifact.files.length ||
            JSON.stringify(previous.install.history) !== JSON.stringify(install.history.slice(0, index))) {
            throw new Error('Sanity website completed predecessor receipt is invalid.');
        }
        history.push(previous);
    }
    if (loadHistory) {
        const lineage = [...history, { artifact, install }];
        for (const [index, item] of lineage.entries()) {
            const predecessor = index ? sitePredecessor({ ...lineage[index - 1], history: lineage.slice(0, index - 1) }) : null;
            if (JSON.stringify(item.artifact.predecessor ?? null) !== JSON.stringify(predecessor)) {
                throw new Error('Sanity website predecessor pins are invalid.');
            }
        }
        const first = lineage[0];
        if (JSON.stringify(baseline.sourceHashes) !== JSON.stringify(first.artifact.sourceHashes) ||
            (baseline.version === 1 ? JSON.stringify(baseline.originals) !== JSON.stringify(first.install.beforeBytes) :
                !validOriginalSiteBaseline(baseline.originals, first.install.beforeBytes, first.artifact))) {
            throw new Error('Sanity website first original baseline changed.');
        }
        const retainedBytes = lineage.reduce((sum, item) => sum + retainedSiteByteCount(item), 0) +
            Object.values(baseline.originals).reduce((sum, bytes) => sum + (bytes === null ? 0 : Buffer.from(bytes, 'base64').length), 0);
        if (retainedBytes > CMS_INSTALL_MAX_BYTES) throw new Error('Sanity website retained history exceeds the size limit.');
    }
    return { install, artifact, baseline, history, hash: file.hash, stat: file.stat };
}

async function verifySiteInstallPaths(root, artifact, { completed = false, history = [], allowEditableSourceChanges = false } = {}) {
    const targets = new Map(artifact.files.map((entry) => [entry.path, entry]));
    const predecessors = new Map(history.flatMap((prior) => prior.artifact.files.map((file) => [file.path, file])));
    for (const [rel, entry] of predecessors) {
        if (!targets.has(rel) && await privatePathHash(root, rel) !== entry.sha256) {
            throw new Error(`Sanity website retained predecessor changed at ${rel}. Your file was preserved.`);
        }
    }
    const profilePins = sanitySiteEngine().PROFILE.sourcePins;
    for (const [rel, expected] of Object.entries(artifact.sourceHashes)) {
        if (allowEditableSourceChanges && !targets.has(rel) && !Object.hasOwn(profilePins, rel)) continue;
        const target = targets.get(rel);
        const current = await privatePathHash(root, rel);
        if (target ? (completed ? current !== target.sha256 :
            current !== target.beforeSha256 && current !== target.sha256) : current !== expected) {
            throw new Error(`Sanity website source changed at ${rel}. Recover this private copy before continuing.`);
        }
    }
    for (const entry of artifact.files) {
        const actual = await privatePathHash(root, entry.path);
        if (completed ? actual !== entry.sha256 : actual !== entry.beforeSha256 && actual !== entry.sha256) {
            throw new Error(`Sanity website installation is conflicted at ${entry.path}. Your file was preserved.`);
        }
    }
}

async function assertNoPendingSiteInstall(root, base) {
    if (cmsInstallContext.getStore()?.root === root) return;
    const { record, container } = privateWorkingCopyRecords.get(root) ?? await privateCopyRecordForRoot(root, base);
    const retained = await readSiteInstall(container, record.copyId);
    if (retained && retained.install.status !== 'complete') {
        throw new Error('Sanity website setup needs recovery before editing, preview or release.');
    }
}

async function assertRetainedSanitySiteReady(root, base = privateWorkingCopyBase()) {
    root = await requirePrivateWorkingRoot(root, base);
    return withJournalLease(root, base, async () => {
        const { record, container } = privateWorkingCopyRecords.get(root) ?? await privateCopyRecordForRoot(root, base);
        const retained = await readSiteInstall(container, record.copyId);
        if (!retained) return null;
        if (retained.install.status !== 'complete' || retained.install.completed.length !== retained.artifact.files.length) {
            throw new Error('Sanity website setup needs recovery before preview or release.');
        }
        if (retained.install.requiresPreparation) {
            throw new Error('Prepare a fresh reviewed website version before preview or release.');
        }
        await verifySiteInstallPaths(root, retained.artifact, { completed: true, history: retained.history });
        await verifyIncomingSiteSourceInventory(root, retained.artifact, retained, retained.history);
        return retained;
    });
}

async function verifySiteRecaptureAdmission(root, retained, journal, current) {
    if (retained.install.status !== 'complete' || retained.install.completed.length !== retained.artifact.files.length || journal.intent) {
        throw new Error('Sanity website setup needs recovery before preparing another capture.');
    }
    await verifySiteInstallPaths(root, retained.artifact, { completed: true, history: retained.history, allowEditableSourceChanges: true });
    const owned = new Set(sitePredecessor(retained).targets.map((file) => file.path));
    const profilePins = sanitySiteEngine().PROFILE.sourcePins;
    const writes = new Map(journal.writes.map((write) => [write.path, write.sha256]));
    current ??= await collectHandoffState(root);
    for (const rel of new Set([...Object.keys(retained.artifact.sourceHashes), ...current.keys()])) {
        if (owned.has(rel) || Object.hasOwn(profilePins, rel)) continue;
        const before = retained.artifact.sourceHashes[rel] ?? null;
        const actual = current.get(rel) ?? null;
        if (before !== actual && (!writes.has(rel) || writes.get(rel) !== actual)) {
            throw new Error(`Website source changed without an exact saved edit at ${rel}. Recover or save this file before recapture.`);
        }
    }
    return current;
}

async function retainedSiteForRecapture(root, base) {
    const { record, container } = await privateCopyRecordForRoot(root, base);
    const retained = await readSiteInstall(container, record.copyId);
    if (!retained) return null;
    const { journal } = await readPrivateJournal(container, record.copyId);
    await verifySiteRecaptureAdmission(root, retained, journal);
    return retained;
}

// Match the full incoming inventory, including additions and deletions, inside the lease.
async function verifyIncomingSiteSourceInventory(root, artifact, existing, history) {
    await verifySiteInstallPaths(root, artifact, { history });
    const current = await collectHandoffState(root);
    const targets = new Map([...history.flatMap((item) => item.artifact.files), ...artifact.files].map((file) => [file.path, file]));
    const originalHashes = existing?.baseline.sourceHashes ?? artifact.sourceHashes;
    const source = new Map();
    for (const [rel, actual] of current) {
        if (targets.has(rel)) {
            if (Object.hasOwn(originalHashes, rel)) source.set(rel, originalHashes[rel]);
        } else source.set(rel, actual);
    }
    if (!sameHandoffFiles(new Map(Object.entries(artifact.sourceHashes)), source)) {
        throw new Error('Website source membership changed since capture. Prepare this version again.');
    }
}

function siteInstallMetadata(retained) {
    const { install, artifact } = retained;
    return { status: install.status, scope: { ...artifact.scope }, manifestHash: artifact.manifestHash,
        captureId: artifact.captureId, contentHash: artifact.contentHash, draftHash: artifact.draftHash };
}

async function inspectRetainedSanitySiteInstall(root, base = privateWorkingCopyBase()) {
    root = await requirePrivateWorkingRoot(root, base);
    return withJournalLease(root, base, async () => {
        const { record, container } = await privateCopyRecordForRoot(root, base);
        const retained = await readSiteInstall(container, record.copyId);
        if (!retained) return null;
        const { journal } = await readPrivateJournal(container, record.copyId);
        if (journal.intent && !retained.artifact.files.some((entry) => entry.path === journal.intent.path &&
            entry.beforeSha256 === journal.intent.beforeSha256 && entry.sha256 === journal.intent.desiredSha256)) {
            throw new Error('An unrelated private write needs recovery before Sanity website setup.');
        }
        const metadata = siteInstallMetadata(retained);
        if (retained.install.status === 'complete') {
            await verifySiteRecaptureAdmission(root, retained, journal);
            if (retained.install.requiresPreparation) metadata.needsPreparation = true;
            try { await verifyIncomingSiteSourceInventory(root, retained.artifact, retained, retained.history); }
            catch (error) {
                // Admission already verified every changed ordinary path against
                // its saved journal receipt. Only those edits need a recapture.
                if (!error.message.startsWith('Sanity website source changed at ') &&
                    !error.message.startsWith('Website source membership changed since capture.')) throw error;
                await verifySiteRecaptureAdmission(root, retained, (await readPrivateJournal(container, record.copyId)).journal);
                metadata.needsPreparation = true;
            }
        } else {
            await verifyIncomingSiteSourceInventory(root, retained.artifact, retained, retained.history);
        }
        return metadata;
    });
}

function assertSiteInstallActive(assertActive = cmsInstallContext.getStore()?.assertActive) {
    if (assertActive !== undefined) {
        if (typeof assertActive !== 'function') throw new Error('Sanity website cancellation guard is invalid.');
        assertActive();
    }
}

async function assertSiteInstallCurrent(assertCurrent, artifact, root, expectedStat) {
    if (assertCurrent !== undefined) {
        if (typeof assertCurrent !== 'function') throw new Error('Sanity website authorization guard is invalid.');
        await assertCurrent({ scope: { ...artifact.scope }, manifestHash: artifact.manifestHash,
            captureId: artifact.captureId, contentHash: artifact.contentHash, draftHash: artifact.draftHash,
            sourceHash: artifact.sourceHash, predecessor: artifact.predecessor ?? null });
    }
    if (!root) return;
    try {
        const actual = await fsp.lstat(path.join(path.dirname(root), 'cms-install.json'), { bigint: true });
        if (!actual.isFile() || actual.isSymbolicLink() || actual.mode & 0o077n || !sameFileVersion(expectedStat, actual)) {
            throw new Error('Native retained website setup changed while authorization was checked.');
        }
    } catch (error) {
        if (error.code === 'ENOENT' && expectedStat === null) return;
        throw error;
    }
}

async function writtenSiteInstallStat(container, value) {
    const file = await currentFile(path.join(container, 'cms-install.json'), 145 * 1024 * 1024);
    if (!file.bytes || file.mode & 0o077 || file.hash !== sha256(Buffer.from(JSON.stringify(value)))) {
        throw new Error('Native retained website setup changed while its marker was written.');
    }
    return file.stat;
}

async function finishSiteInstallUnlocked(root, retained, base, container, copyId, assertCurrent) {
    const { install, artifact, history = [] } = retained;
    let recordStat = retained.stat ?? await writtenSiteInstallStat(container, install);
    await assertSiteInstallCurrent(assertCurrent, artifact, root, recordStat);
    const journal = await readPrivateJournal(container, copyId);
    const intent = journal.journal.intent;
    if (intent && !artifact.files.some((entry) => entry.path === intent.path &&
        entry.beforeSha256 === intent.beforeSha256 && entry.sha256 === intent.desiredSha256)) {
        throw new Error('An unrelated private write needs recovery before Sanity website setup.');
    }
    try { await verifySiteInstallPaths(root, artifact, { history }); }
    catch (error) {
        await writePrivateJsonFile(container, 'cms-install.json', { ...install, status: 'conflicted' });
        throw error;
    }
    if (install.status === 'complete' && !intent) {
        await verifySiteInstallPaths(root, artifact, { completed: true, history });
        return { copyId, status: 'complete', manifestHash: artifact.manifestHash, captureId: artifact.captureId };
    }
    // Only reconcile the exact retained install intent after the whole source binding passed.
    await reconcilePrivateWriteIntent(root, base);
    await assertSiteInstallCurrent(assertCurrent, artifact, root, recordStat);
    const pending = { ...install, status: 'pending' };
    if (install.status !== 'pending') {
        await writePrivateJsonFile(container, 'cms-install.json', pending);
        recordStat = await writtenSiteInstallStat(container, pending);
    }
    const phase = { disable: 0, content: 1, adapter: 2 };
    const ordered = [...artifact.files].sort((a, b) => phase[a.phase] - phase[b.phase] || a.path.localeCompare(b.path));
    let previousPhase;
    for (const entry of ordered) {
        if (entry.phase !== previousPhase) {
            await verifySiteInstallPaths(root, artifact, { history });
            previousPhase = entry.phase;
        }
        const actual = await privatePathHash(root, entry.path);
        if (actual !== entry.sha256) {
            await assertSiteInstallCurrent(assertCurrent, artifact, root, recordStat);
            const intentResult = await beginPrivateWriteIntent(root, entry.path, entry.beforeSha256, entry.sha256, base);
            if (!intentResult.success) throw new Error(`Sanity website installation is conflicted at ${entry.path}.`);
            await assertSiteInstallCurrent(assertCurrent, artifact, root, recordStat);
            const written = await writeIfUnchanged(root, entry.path, entry.bytes, entry.beforeSha256);
            if (!written.success || written.hash !== entry.sha256) {
                throw new Error(written.error || `Sanity website installation is conflicted at ${entry.path}.`);
            }
            await reconcilePrivateWriteIntent(root, base);
        } else {
            // Crash after replacement but before journal completion is safe only for exact retained bytes.
            await recordPrivateWrite(root, entry.path, entry.sha256, base);
        }
        if (!pending.completed.includes(entry.path)) pending.completed.push(entry.path);
        // The existing per-file journal is durable. Recovery rereads before/desired
        // bytes, so a large retained payload need only be written at completion.
    }
    await verifySiteInstallPaths(root, artifact, { completed: true, history });
    const finalJournal = await readPrivateJournal(container, copyId);
    if (finalJournal.journal.intent || artifact.files.some((entry) =>
        !finalJournal.journal.writes.some((write) => write.path === entry.path && write.sha256 === entry.sha256))) {
        throw new Error('Sanity website installation journal is incomplete.');
    }
    await verifyIncomingSiteSourceInventory(root, artifact, retained, history);
    await assertSiteInstallCurrent(assertCurrent, artifact, root, recordStat);
    const complete = { ...pending, status: 'complete', completedAt: new Date().toISOString() };
    if (pending.preparationSuccessor) {
        delete complete.requiresPreparation;
        delete complete.preparationSuccessor;
    }
    await writePrivateJsonFile(container, 'cms-install.json', complete);
    // A completed marker never substitutes for the final native reread.
    await verifySiteInstallPaths(root, artifact, { completed: true, history });
    return { copyId, status: 'complete', manifestHash: artifact.manifestHash, captureId: artifact.captureId };
}

function assertSiteInstallIdle(root) {
    if (isDevServerRunning(devServers.get(root)) || startingDevServers.has(root) ||
        dependencyInstalls.has(root) || activeCliRoots.has(root)) {
        throw new Error('Stop the preview and wait for dependency setup or AI edits before Sanity website setup.');
    }
}

function sitePredecessor(retained) {
    const targets = new Map([...retained.history, retained].flatMap((item) =>
        item.artifact.files.map((file) => [file.path, file.sha256])));
    return { manifestHash: retained.artifact.manifestHash,
        targets: [...targets].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 })) };
}

function originalSiteBaselineBytes(beforeBytes) {
    return Object.fromEntries(Object.entries(beforeBytes).filter(([, bytes]) => bytes !== null).sort(([a], [b]) => a.localeCompare(b)));
}

function originalSiteAssetPath(rel) {
    return /^public\/weblab-frozen-sanity\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/.test(rel);
}

function validOriginalSiteBaseline(originals, beforeBytes, artifact) {
    const expected = new Set([...Object.keys(originalSiteBaselineBytes(beforeBytes)),
        ...Object.keys(artifact.sourceHashes).filter(originalSiteAssetPath)]);
    const ordered = [...expected].sort((a, b) => a.localeCompare(b));
    return JSON.stringify(Object.keys(originals)) === JSON.stringify(ordered) &&
        Object.entries(beforeBytes).every(([rel, bytes]) => bytes === null || originals[rel] === bytes);
}

function retainedSiteByteCount(retained) {
    return retained.artifact.files.reduce((sum, file) => sum + file.bytes.length, 0) +
        Object.values(retained.install.beforeBytes).reduce((sum, bytes) => sum + (bytes === null ? 0 : Buffer.from(bytes, 'base64').length), 0);
}

async function writeImmutableSiteJson(container, name, value, expectedHash, assertActive) {
    const bytes = Buffer.from(JSON.stringify(value));
    const hash = sha256(bytes);
    if (expectedHash && expectedHash !== hash) throw new Error('Sanity website predecessor receipt changed.');
    const target = path.join(container, name);
    const existing = await currentFile(target, 145 * 1024 * 1024);
    if (existing.bytes) {
        if (existing.hash !== hash || existing.mode & 0o077) throw new Error('Sanity website immutable receipt is inconsistent.');
        return hash;
    }
    const temporary = path.join(container, `${randomUUID()}.${name}.tmp`);
    try {
        const handle = await fsp.open(temporary, 'wx', 0o400);
        try { await handle.writeFile(bytes); await handle.sync(); }
        finally { await handle.close(); }
        assertSiteInstallActive(assertActive);
        try { await fsp.link(temporary, target); }
        catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const raced = await currentFile(target, 145 * 1024 * 1024);
            if (raced.hash !== hash || raced.mode & 0o077) throw new Error('Sanity website immutable receipt changed.');
        }
        const dir = await fsp.open(container, fsConstants.O_RDONLY);
        try { await dir.sync(); } finally { await dir.close(); }
        return hash;
    } finally { await fsp.rm(temporary, { force: true }); }
}

async function preflightSiteInstallLimits(root, base, artifact, existing, manifest) {
    const current = await computePrivateHandoffPlanUnlocked(root, base, { allowUnchanged: true, release: true, recapture: Boolean(existing) });
    if (current.sourceChanged || current.unsupportedChanges.length) throw new Error('Project files need review or recovery before website setup.');
    const baseline = new Map(manifest.baseline.map((file) => [file.path, file]));
    const changes = new Map(current.changedFiles.map((file) => [file.path, file]));
    for (const file of artifact.files.filter((entry) => entry.kind === 'text')) {
        changes.set(file.path, { path: file.path, original: baseline.get(file.path)?.content ?? null, updated: file.bytes.toString('utf8') });
    }
    const changed = [...changes.values()].filter((file) => file.updated !== file.original);
    const textBytes = changed.reduce((sum, file) => sum + Buffer.byteLength(file.original ?? '') + Buffer.byteLength(file.updated ?? ''), 0);
    if (changed.length > HANDOFF_MAX_CHANGED_FILES || textBytes > HANDOFF_MAX_DIFF_BYTES) {
        throw new Error('Website setup would exceed the release text limit of 100 files or 10 MB.');
    }
    const { releasePathAllowed } = require('./release/policy');
    const paths = await collectHandoffState(root);
    const historicalAssets = new Set((existing ? [...existing.history, existing] : []).flatMap((item) =>
        item.artifact.files.filter((file) => file.kind === 'asset').map((file) => file.path)));
    const active = new Map(artifact.files.map((file) => [file.path, file]));
    let total = 0;
    let count = 0;
    for (const rel of new Set([...paths.keys(), ...active.keys()])) {
        if (!releasePathAllowed(rel) || historicalAssets.has(rel) && !active.has(rel)) continue;
        const size = active.has(rel) ? active.get(rel).bytes.length : Number((await fsp.lstat(resolveWithin(root, rel))).size);
        if (size > 32 * 1024 * 1024 || (total += size) > CMS_INSTALL_MAX_BYTES || ++count > 10_000) {
            throw new Error('Website setup would exceed the release file or byte limit.');
        }
    }
}

/** Read the approved original source view after verifying the native completed lineage. */
async function readVerifiedSanitySiteSource(root, base = privateWorkingCopyBase()) {
    root = await requirePrivateWorkingRoot(root, base);
    return withJournalLease(root, base, async () => {
        const { record, container } = await privateCopyRecordForRoot(root, base);
        const retained = await retainedSiteForRecapture(root, base);
        if ((await readPrivateJournal(container, record.copyId)).journal.intent) {
            throw new Error('A private write needs recovery before capturing website content.');
        }
        const current = await collectHandoffState(root);
        const targets = new Set(retained ? sitePredecessor(retained).targets.map((file) => file.path) : []);
        const sourceFiles = [];
        for (const [rel, expected] of [...current].sort(([a], [b]) => a.localeCompare(b))) {
            if (retained && targets.has(rel) && !Object.hasOwn(retained.baseline.sourceHashes, rel)) continue;
            const abs = resolveWithin(root, rel);
            await rejectSymlinkPath(root, abs);
            await verifyExistingParent(root, abs);
            const file = await currentFile(abs, 32 * 1024 * 1024);
            if (!file.bytes || file.hash !== expected) throw new Error('Website source changed while preparing its original view.');
            const original = retained?.baseline.originals[rel];
            sourceFiles.push({ path: rel, bytes: typeof original === 'string' ? Buffer.from(original, 'base64') : file.bytes });
        }
        if (retained) await verifySiteRecaptureAdmission(root, retained, (await readPrivateJournal(container, record.copyId)).journal);
        return { sourceFiles, predecessor: retained ? sitePredecessor(retained) : null };
    });
}

async function resumeRetainedSanitySiteInstall(root, base = privateWorkingCopyBase(), { assertCurrent, assertActive, requiresPreparation } = {}) {
    if (requiresPreparation !== undefined && typeof requiresPreparation !== 'boolean') {
        throw new Error('Sanity website recovery preparation option is invalid.');
    }
    root = await requirePrivateWorkingRoot(root, base);
    if (isDevServerRunning(devServers.get(root)) || startingDevServers.has(root) || dependencyInstalls.has(root)) {
        throw new Error('Stop the preview and wait for dependency setup before Sanity website setup.');
    }
    return withWriteLock(`journal:${root}`, () => withJournalLease(root, base, async () => {
        assertSiteInstallIdle(root);
        const { record, container } = await privateCopyRecordForRoot(root, base);
        const retained = await readSiteInstall(container, record.copyId);
        if (!retained) throw new Error('No retained Sanity website installation is available.');
        assertSiteInstallActive(assertActive);
        if (requiresPreparation) {
            await verifyIncomingSiteSourceInventory(root, retained.artifact, retained, retained.history);
            await assertSiteInstallCurrent(assertCurrent, retained.artifact, root, retained.stat);
            const gated = { ...retained.install, requiresPreparation: true };
            // Explicit retained-byte recovery has no authority to clear the
            // preview gate, even if this was once a current successor capture.
            delete gated.preparationSuccessor;
            await writePrivateJsonFile(container, 'cms-install.json', gated, 0o600, assertActive);
            retained.install = gated;
            retained.stat = await writtenSiteInstallStat(container, gated);
        }
        return cmsInstallContext.run({ root, assertActive }, () => finishSiteInstallUnlocked(root, retained, base, container, record.copyId, assertCurrent));
    }));
}

async function installRetainedSanitySite(root, retainedHandle, base = privateWorkingCopyBase(), { assertCurrent, assertActive } = {}) {
    root = await requirePrivateWorkingRoot(root, base);
    if (isDevServerRunning(devServers.get(root)) || startingDevServers.has(root) || dependencyInstalls.has(root)) {
        throw new Error('Stop the preview and wait for dependency setup before Sanity website setup.');
    }
    const artifact = sanitySiteEngine().getRetainedSiteArtifact(retainedHandle);
    sanitySiteEngine().validateMaterializedSiteArtifact(artifact);
    return withWriteLock(`journal:${root}`, () => withJournalLease(root, base, async () => {
        assertSiteInstallIdle(root);
        const { record, container, manifest } = await privateCopyRecordForRoot(root, base);
        const existing = await readSiteInstall(container, record.copyId);
        await assertSiteInstallCurrent(assertCurrent, artifact, root, existing?.stat ?? null);
        assertSiteInstallActive(assertActive);
        if (artifact.scope?.rootPath !== root) throw new Error('Retained Sanity website capture belongs to a different private copy.');
        if (existing?.artifact.manifestHash === artifact.manifestHash) {
            return cmsInstallContext.run({ root, assertActive }, () => finishSiteInstallUnlocked(root, existing, base, container, record.copyId, assertCurrent));
        }
        if ((await readPrivateJournal(container, record.copyId)).journal.intent) {
            throw new Error('An unrelated private write needs recovery before Sanity website setup.');
        }
        let history = [];
        let historyPins = [];
        let baselineHash;
        if (existing) {
            if (existing.install.status !== 'complete') throw new Error('Recover the pending Sanity website setup before preparing another capture.');
            await verifySiteRecaptureAdmission(root, existing, (await readPrivateJournal(container, record.copyId)).journal);
            const predecessor = sitePredecessor(existing);
            if (JSON.stringify(artifact.predecessor) !== JSON.stringify(predecessor)) {
                throw new Error('The retained website capture has an outdated predecessor. Prepare a new capture.');
            }
            if (existing.install.history.length >= 20) throw new Error('Sanity website retained history has reached its safe limit.');
            history = [...existing.history, existing];
            historyPins = [...existing.install.history, { manifestHash: existing.artifact.manifestHash, receiptSha256: existing.hash }];
            baselineHash = existing.install.baselineHash;
        } else if (artifact.predecessor) {
            throw new Error('The retained website capture requires a different predecessor.');
        }
        const beforeBytes = {};
        let retainedBytes = artifact.files.reduce((sum, entry) => sum + entry.bytes.length, 0);
        for (const prior of history) retainedBytes += retainedSiteByteCount(prior);
        for (const entry of artifact.files) {
            await privatePathHash(root, entry.path);
            const before = await currentFile(resolveWithin(root, entry.path), 32 * 1024 * 1024);
            if (before.hash !== entry.beforeSha256) throw new Error(`Sanity website source changed at ${entry.path}.`);
            retainedBytes += before.bytes?.length ?? 0;
            if (retainedBytes > CMS_INSTALL_MAX_BYTES) throw new Error('Sanity website retained installation exceeds the size limit.');
            beforeBytes[entry.path] = before.bytes?.toString('base64') ?? null;
        }
        const originals = existing?.baseline.originals ?? originalSiteBaselineBytes(beforeBytes);
        if (!existing) {
            // Original-present frozen assets remain part of the immutable source
            // view even when a retry captures a different active asset set.
            for (const [rel, expected] of Object.entries(artifact.sourceHashes).filter(([rel]) => originalSiteAssetPath(rel))) {
                const original = await currentFile(resolveWithin(root, rel), 32 * 1024 * 1024);
                if (!original.bytes || original.hash !== expected) throw new Error('Sanity website original asset changed before baseline retention.');
                originals[rel] = original.bytes.toString('base64');
            }
        }
        retainedBytes += Object.values(originals).reduce((sum, bytes) => sum + (bytes === null ? 0 : Buffer.from(bytes, 'base64').length), 0);
        if (retainedBytes > CMS_INSTALL_MAX_BYTES) throw new Error('Sanity website retained history exceeds the size limit.');
        await verifyIncomingSiteSourceInventory(root, artifact, existing, history);
        await preflightSiteInstallLimits(root, base, artifact, existing, manifest);
        const firstBaseline = existing ? null : {
            version: 2, copyId: record.copyId, sourceHashes: artifact.sourceHashes, originals: originalSiteBaselineBytes(originals),
        };
        if (firstBaseline) {
            const bytes = Buffer.from(JSON.stringify(firstBaseline));
            if (bytes.length > 15 * 1024 * 1024) throw new Error('Sanity website original baseline exceeds its retained size limit.');
            baselineHash = sha256(bytes);
        }
        const install = { version: 1, copyId: record.copyId, status: 'pending', history: historyPins, baselineHash,
            ...(existing?.install.requiresPreparation ? { requiresPreparation: true, preparationSuccessor: true } : {}),
            profileHash: artifact.profileHash, captureId: artifact.captureId, sourceHash: artifact.sourceHash,
            contentHash: artifact.contentHash, draftHash: artifact.draftHash, manifestHash: artifact.manifestHash,
            artifact: serializeSiteArtifact(artifact), beforeBytes, completed: [] };
        // Reserve space for the completed path list as well as the pending payload.
        if (Buffer.byteLength(JSON.stringify({ ...install, completed: artifact.files.map((file) => file.path),
            status: 'complete', completedAt: new Date().toISOString() })) > 145 * 1024 * 1024) {
            throw new Error('Sanity website retained record exceeds its size limit.');
        }
        if (firstBaseline) await writeImmutableSiteJson(container, 'cms-install-baseline.json', firstBaseline, undefined, assertActive);
        else await writeImmutableSiteJson(container, `cms-install-${existing.artifact.manifestHash}.json`, existing.install, existing.hash, assertActive);
        assertSiteInstallIdle(root);
        if (existing) await verifySiteRecaptureAdmission(root, existing, (await readPrivateJournal(container, record.copyId)).journal);
        await verifyIncomingSiteSourceInventory(root, artifact, existing, history);
        await assertSiteInstallCurrent(assertCurrent, artifact, root, existing?.stat ?? null);
        if (existing) await verifySiteRecaptureAdmission(root, existing, (await readPrivateJournal(container, record.copyId)).journal);
        await verifyIncomingSiteSourceInventory(root, artifact, existing, history);
        // Predecessor receipt and original baseline are durable before replacing the active marker.
        await writePrivateJsonFile(container, 'cms-install.json', install, 0o600, assertActive);
        return cmsInstallContext.run({ root, assertActive }, () => finishSiteInstallUnlocked(root, { install, artifact, history, baseline: existing?.baseline ?? firstBaseline }, base, container, record.copyId, assertCurrent));
    }));
}

async function validateIndependentGitRoot(root) {
    const gitDirectory = path.join(root, '.git');
    const stat = await fsp.lstat(gitDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error('Git worktrees and linked repositories are not supported for private editing.');
    }
    const gitRoot = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'], root)).trim();
    const gitDir = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--absolute-git-dir'], root)).trim();
    const commonDir = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--git-common-dir'], root)).trim();
    if (await fsp.realpath(gitRoot) !== root || await fsp.realpath(gitDir) !== gitDirectory ||
        await fsp.realpath(path.resolve(root, commonDir)) !== gitDirectory) {
        throw new Error('This Git repository uses an external working tree or object directory.');
    }
    for (const rel of ['.gitmodules', '.git/objects/info/alternates', '.git/modules', '.git/index.lock']) {
        try {
            await fsp.lstat(path.join(root, rel));
            throw new Error(`Unsupported Git layout: ${rel}`);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
    const staged = await git(['-c', 'core.fsmonitor=false', 'ls-files', '--stage', '-z'], root);
    if (staged.split('\0').some((line) => line.startsWith('160000 '))) {
        throw new Error('Git submodules are not supported for private editing.');
    }
}

async function inspectSourceGitLayout(root) {
    const marker = path.join(root, '.git');
    const markerStat = await fsp.lstat(marker);
    if (markerStat.isDirectory() && !markerStat.isSymbolicLink()) {
        await validateIndependentGitRoot(root);
        return { kind: 'independent', indexPath: path.join(marker, 'index') };
    }
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 4096) {
        throw new Error('Unsupported Git worktree link.');
    }
    const markerFile = await currentFile(marker);
    const markerText = new TextDecoder('utf-8', { fatal: true }).decode(markerFile.bytes);
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(markerText);
    if (!match) throw new Error('Unsupported Git worktree link.');
    const linkedGitDir = path.resolve(root, match[1]);
    const actualGitDir = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--absolute-git-dir'], root)).trim();
    const commonPath = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--git-common-dir'], root)).trim();
    const gitDir = await fsp.realpath(linkedGitDir);
    const commonDir = await fsp.realpath(path.resolve(root, commonPath));
    const gitRoot = (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'], root)).trim();
    if (await fsp.realpath(gitRoot) !== root ||
        await fsp.realpath(actualGitDir) !== gitDir ||
        path.dirname(gitDir) !== path.join(commonDir, 'worktrees') ||
        !(await fsp.lstat(linkedGitDir)).isDirectory() ||
        !(await fsp.lstat(commonDir)).isDirectory()) {
        throw new Error('Unsupported Git worktree link.');
    }
    const backLink = await currentFile(path.join(gitDir, 'gitdir'));
    if (!backLink.bytes ||
        await fsp.realpath(path.resolve(gitDir, backLink.bytes.toString('utf8').trim())) !== marker) {
        throw new Error('Unsupported Git worktree link.');
    }
    const indexPath = await fsp.realpath(path.resolve(root,
        (await git(['-c', 'core.fsmonitor=false', 'rev-parse', '--git-path', 'index'], root)).trim()));
    if (indexPath !== path.join(gitDir, 'index')) throw new Error('Unsupported Git worktree index.');
    for (const abs of [
        path.join(root, '.gitmodules'), path.join(commonDir, 'objects', 'info', 'alternates'),
        path.join(gitDir, 'index.lock'), path.join(gitDir, 'HEAD.lock'),
    ]) {
        try { await fsp.lstat(abs); throw new Error(`Unsupported Git layout: ${abs}`); }
        catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
    let sparseCheckout = '';
    try { sparseCheckout = (await git(['config', '--bool', '--get', 'core.sparseCheckout'], root)).trim(); }
    catch (err) { if (err.code !== 1) throw err; }
    let promisorConfig = '';
    try {
        promisorConfig = (await git(['config', '--get-regexp',
            '^(extensions\\.partialClone|remote\\..*\\.promisor)$'], root)).trim();
    } catch (err) { if (err.code !== 1) throw err; }
    if ((await git(['rev-parse', '--shared-index-path'], root)).trim() || sparseCheckout === 'true') {
        throw new Error('Split or sparse Git indexes are not supported for private editing.');
    }
    if (promisorConfig || (await git(['rev-parse', '--is-shallow-repository'], root)).trim() === 'true') {
        throw new Error('Partial or shallow Git worktrees are not supported for private editing.');
    }
    let uploadPackHook = '';
    try { uploadPackHook = (await git(['config', '--get', 'uploadpack.packObjectsHook'], root)).trim(); }
    catch (err) { if (err.code !== 1) throw err; }
    if (uploadPackHook) {
        throw new Error('Git upload-pack hooks are not supported for private editing.');
    }
    const staged = await git(['-c', 'core.fsmonitor=false', 'ls-files', '--stage', '-z'], root);
    if (staged.split('\0').some((line) => line && !/^100(?:644|755) [a-f0-9]+ [0-3]\t/.test(line))) {
        throw new Error('Submodules, sparse entries, and linked files are not supported for private editing.');
    }
    // The shallow private fetch still imports every blob in HEAD's tree.
    // Bound committed files too, including those deleted in the worktree.
    const committed = await git(['ls-tree', '-r', '-l', '-z', 'HEAD'], root,
        30_000, 64 * 1024 * 1024);
    let committedBytes = 0;
    let committedFiles = 0;
    for (const entry of committed.split('\0')) {
        if (!entry) continue;
        const match = /^100(?:644|755) blob [a-f0-9]{40,64} +([0-9]+)\t/.exec(entry);
        if (!match) throw new Error('Unsupported files in the committed Git tree.');
        committedBytes += Number(match[1]);
        if (++committedFiles > PRIVATE_COPY_MAX_FILES || committedBytes > PRIVATE_COPY_MAX_BYTES) {
            throw new Error('Committed Git tree exceeds the private copy size limit.');
        }
    }
    return {
        kind: 'linked-worktree', gitDir, commonDir, indexPath,
        pointerSha256: markerFile.hash,
        branch: (await git(['branch', '--show-current'], root)).trim() || null,
    };
}

async function sourceGitSnapshot(root, expectedLayout) {
    const layout = await inspectSourceGitLayout(root);
    if (expectedLayout && JSON.stringify(layout) !== JSON.stringify(expectedLayout)) {
        throw new Error('Source Git worktree changed. Review again.');
    }
    const indexSha256 = (await currentFile(layout.indexPath)).hash;
    if (layout.kind === 'linked-worktree' && !indexSha256) {
        throw new Error('Linked worktree index is missing.');
    }
    return { layout, head: await gitHead(root), indexSha256 };
}

async function materializeLinkedWorktreeGit(root, sourceRoot, sourceHead, branch, container) {
    if (!sourceHead || !/^[a-f0-9]{40,64}$/.test(sourceHead)) {
        throw new Error('A linked worktree needs a committed HEAD.');
    }
    const template = path.join(container, 'empty-git-template');
    await fsp.mkdir(template, { mode: 0o700 });
    await isolatedGit(['init', '-q', `--template=${template}`], root, template);
    await isolatedGit([
        '-c', 'protocol.file.allow=always', '-c', 'uploadpack.packObjectsHook=',
        'fetch', '--depth=1', '--no-tags', '--no-recurse-submodules',
        '--no-write-fetch-head', pathToFileURL(sourceRoot).href, 'HEAD',
    ], root, template, 60_000);
    if (branch) await isolatedGit(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], root, template);
    await isolatedGit(['update-ref', ...(branch ? [] : ['--no-deref']), 'HEAD', sourceHead], root, template);
    await isolatedGit(['read-tree', sourceHead], root, template);
    if (await gitHead(root) !== sourceHead) throw new Error('Private Git HEAD does not match the source.');
    if ((await git(['remote'], root)).trim()) throw new Error('Private Git has an unexpected remote.');
    try {
        await fsp.lstat(path.join(root, '.git', 'worktrees'));
        throw new Error('Private Git links to another worktree.');
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

async function inventoryPrivateCopySource(root, skipRootGitPointer = false) {
    const rootStat = await fsp.lstat(root, { bigint: true });
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Source root changed.');
    const entries = [];
    const excludedPaths = [];
    const exclusions = [];
    let totalBytes = 0;
    const visit = async (relative) => {
        const dir = relative ? path.join(root, relative) : root;
        await rejectSymlinkPath(root, dir);
        for (const name of (await fsp.readdir(dir)).sort()) {
            if (skipRootGitPointer && !relative && name === '.git') continue;
            const rel = relative ? path.join(relative, name) : name;
            const abs = path.join(root, rel);
            const stat = await fsp.lstat(abs, { bigint: true });
            const reason = relative !== '.git' && !relative.startsWith(`.git${path.sep}`)
                ? privateCopyExclusion(rel) : null;
            if (reason) {
                const excluded = rel.split(path.sep).join('/');
                excludedPaths.push(excluded);
                exclusions.push({ path: excluded, reason });
                if (excludedPaths.length > 200) throw new Error('Too many excluded paths to review.');
                continue;
            }
            if (stat.isSymbolicLink()) throw new Error(`Symlink cannot be copied safely: ${rel}`);
            if (name === '.git' && relative) throw new Error(`Nested Git repository cannot be copied: ${rel}`);
            if (!stat.isDirectory() && !stat.isFile()) {
                throw new Error(`Special file cannot be copied safely: ${rel}`);
            }
            entries.push({ rel, type: stat.isDirectory() ? 'directory' : 'file', stat });
            if (entries.length > PRIVATE_COPY_MAX_FILES) throw new Error('Private copy exceeds the 50,000 file limit.');
            if (stat.isFile()) {
                totalBytes += Number(stat.size);
                if (totalBytes > PRIVATE_COPY_MAX_BYTES) {
                    throw new Error('Private copy exceeds the 2 GB size limit.');
                }
            } else {
                await visit(rel);
            }
        }
    };
    await visit('');
    return { rootStat, entries, excludedPaths, exclusions };
}

async function copySnapshotFile(source, destination, expectedStat) {
    const reader = await fsp.open(source, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let writer;
    try {
        if (!sameSnapshotStat(await reader.stat({ bigint: true }), expectedStat)) {
            throw new Error('Source changed during private copy. Try again.');
        }
        writer = await fsp.open(destination, 'wx', 0o600);
        const digest = createHash('sha256');
        const buffer = Buffer.allocUnsafe(256 * 1024);
        let position = 0;
        while (true) {
            const { bytesRead } = await reader.read(buffer, 0, buffer.length, position);
            if (!bytesRead) break;
            let written = 0;
            while (written < bytesRead) {
                const result = await writer.write(buffer, written, bytesRead - written);
                if (!result.bytesWritten) throw new Error('Private copy write stalled.');
                written += result.bytesWritten;
            }
            digest.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        if (!sameSnapshotStat(await reader.stat({ bigint: true }), expectedStat)) {
            throw new Error('Source changed during private copy. Try again.');
        }
        await writer.chmod(Number(expectedStat.mode & 0o777n));
        await writer.sync();
        return digest.digest('hex');
    } finally {
        await writer?.close();
        await reader.close();
    }
}

async function hashSnapshotFile(abs, expectedStat) {
    const handle = await fsp.open(abs, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
        if (!sameSnapshotStat(await handle.stat({ bigint: true }), expectedStat)) {
            throw new Error('Source changed during private copy. Try again.');
        }
        const digest = createHash('sha256');
        const buffer = Buffer.allocUnsafe(256 * 1024);
        let position = 0;
        while (true) {
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
            if (!bytesRead) break;
            digest.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
        }
        if (!sameSnapshotStat(await handle.stat({ bigint: true }), expectedStat)) {
            throw new Error('Source changed during private copy. Try again.');
        }
        return digest.digest('hex');
    } finally {
        await handle.close();
    }
}

async function verifyPrivateCopySnapshot(sourceRoot, copyRoot, initial, hashes, skipRootGitPointer = false) {
    const current = await inventoryPrivateCopySource(sourceRoot, skipRootGitPointer);
    if (!sameSnapshotStat(current.rootStat, initial.rootStat) ||
        current.entries.length !== initial.entries.length ||
        current.excludedPaths.join('\0') !== initial.excludedPaths.join('\0')) {
        throw new Error('Source tree changed during private copy. Try again.');
    }
    for (let i = 0; i < initial.entries.length; i++) {
        const before = initial.entries[i];
        const after = current.entries[i];
        if (before.rel !== after.rel || before.type !== after.type ||
            !sameSnapshotStat(before.stat, after.stat)) {
            throw new Error('Source tree changed during private copy. Try again.');
        }
        if (before.type !== 'file') continue;
        const sourceHash = await hashSnapshotFile(path.join(sourceRoot, before.rel), before.stat);
        const copyStat = await fsp.lstat(path.join(copyRoot, before.rel), { bigint: true });
        const copyHash = await hashSnapshotFile(path.join(copyRoot, before.rel), copyStat);
        if (sourceHash !== hashes.get(before.rel) || copyHash !== sourceHash) {
            throw new Error('File changed during private copy. Try again.');
        }
    }
}

async function readPrivateCopyManifest(base, sourceRoot, record) {
    const copyId = record.copyId;
    const container = path.join(base, copyId);
    const rootPath = path.join(container, 'project');
    const manifestPath = path.join(container, 'baseline.json');
    const containerStat = await fsp.lstat(container);
    const rootStat = await fsp.lstat(rootPath);
    const manifestStat = await fsp.lstat(manifestPath);
    if (!containerStat.isDirectory() || containerStat.isSymbolicLink() ||
        !rootStat.isDirectory() || rootStat.isSymbolicLink() ||
        !manifestStat.isFile() || manifestStat.isSymbolicLink() || (manifestStat.mode & 0o077) ||
        await fsp.realpath(rootPath) !== rootPath) {
        throw new Error('Private working copy metadata or files are inconsistent.');
    }
    const bytes = await fsp.readFile(manifestPath);
    if (sha256(bytes) !== record.manifestSha256) {
        throw new Error('Private working copy baseline changed. Refusing to open it.');
    }
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (![1, 2].includes(manifest.version) || manifest.copyId !== copyId ||
        manifest.sourceRootPath !== sourceRoot || manifest.rootPath !== rootPath ||
        !Array.isArray(manifest.baseline) || !Array.isArray(manifest.snapshot) ||
        !Array.isArray(manifest.excludedPaths) ||
        (manifest.sourceGitHead !== null && typeof manifest.sourceGitHead !== 'string') ||
        (manifest.sourceIndexSha256 !== null && !/^[a-f0-9]{64}$/.test(manifest.sourceIndexSha256)) ||
        (manifest.version === 2 && (!manifest.sourceGitLayout ||
            manifest.sourceGitLayout.kind !== 'linked-worktree' ||
            !path.isAbsolute(manifest.sourceGitLayout.gitDir) ||
            !path.isAbsolute(manifest.sourceGitLayout.commonDir) ||
            !path.isAbsolute(manifest.sourceGitLayout.indexPath) ||
            (manifest.sourceGitLayout.branch !== null &&
                typeof manifest.sourceGitLayout.branch !== 'string') ||
            !/^[a-f0-9]{64}$/.test(manifest.sourceGitLayout.pointerSha256)))) {
        throw new Error('Private working copy metadata or files are inconsistent.');
    }
    if ([...manifest.baseline, ...manifest.snapshot].some((entry) =>
        !entry || typeof entry.path !== 'string' || privateCopyExclusion(entry.path))) {
        throw new Error('This older private copy contains credential data or copied build output. Keep it for recovery and start a fresh copy.');
    }
    await assertPrivateCredentialsAbsent(rootPath);
    await readPrivateJournal(container, copyId);
    await validateIndependentGitRoot(rootPath);
    return manifest;
}

async function readPrivateCopyIndexLock(lockPath) {
    const handle = await fsp.open(lockPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
        const stat = await handle.stat({ bigint: true });
        if (!stat.isFile() || stat.size > 512n || (stat.mode & 0o077n)) {
            throw new Error('Private copy lock needs manual recovery.');
        }
        let owner;
        try { owner = JSON.parse(await handle.readFile('utf8')); }
        catch { throw new Error('Private copy lock needs manual recovery.'); }
        if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
            typeof owner.nonce !== 'string' || !PRIVATE_COPY_ID.test(owner.nonce)) {
            throw new Error('Private copy lock needs manual recovery.');
        }
        return { stat, owner };
    } finally {
        await handle.close();
    }
}

async function removeDeadPrivateCopyIndexLock(lockPath) {
    const { stat, owner } = await readPrivateCopyIndexLock(lockPath);
    try {
        process.kill(owner.pid, 0);
        throw new Error('Another private copy is in progress.');
    } catch (err) {
        if (err.code !== 'ESRCH') throw err;
    }
    const latest = await fsp.lstat(lockPath, { bigint: true });
    if (latest.dev !== stat.dev || latest.ino !== stat.ino ||
        latest.size !== stat.size || latest.mtimeNs !== stat.mtimeNs) {
        throw new Error('Private copy lock changed. Try again.');
    }
    await fsp.unlink(lockPath);
}

async function acquirePrivateCopyIndexLock(base) {
    const lockPath = path.join(base, 'index.lock');
    const owner = { pid: process.pid, nonce: randomUUID() };
    const temporary = path.join(base, `${owner.nonce}.index-lock.tmp`);
    try {
        const handle = await fsp.open(temporary, 'wx', 0o600);
        try {
            await handle.writeFile(JSON.stringify(owner));
            await handle.sync();
        } finally {
            await handle.close();
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await fsp.link(temporary, lockPath);
                return async () => {
                    const current = await readPrivateCopyIndexLock(lockPath);
                    if (current.owner.pid !== owner.pid || current.owner.nonce !== owner.nonce) {
                        throw new Error('Private copy lock ownership changed.');
                    }
                    await fsp.unlink(lockPath);
                };
            } catch (err) {
                if (err.code !== 'EEXIST') throw err;
                if (attempt) throw new Error('Another private copy is in progress.');
                await removeDeadPrivateCopyIndexLock(lockPath);
            }
        }
        throw new Error('Another private copy is in progress.');
    } finally {
        await fsp.rm(temporary, { force: true }).catch(() => {});
    }
}

async function createPrivateWorkingCopy(sourceRoot, base = privateWorkingCopyBase()) {
    const operation = privateCopyQueue.catch(() => {}).then(async () => {
        sourceRoot = await requireGrantedRoot(sourceRoot);
        await preparePrivateCopyBase(base);
        if (base === sourceRoot || base.startsWith(`${sourceRoot}${path.sep}`)) {
            throw new Error('The private copy directory cannot be inside the selected Git project.');
        }
        const releaseLock = await acquirePrivateCopyIndexLock(base);
        try {
            const index = await readPrivateCopyIndex(base);
            const existing = index.copies[sourceRoot];
            let priorCopyId;
            if (existing) {
                try {
                    await inspectSourceGitLayout(sourceRoot);
                    const manifest = await readPrivateCopyManifest(base, sourceRoot, existing);
                    if (await originalMatchesPrivateBaseline(sourceRoot, manifest)) {
                        const existingContainer = path.join(base, existing.copyId);
                        const install = await readDependencyInstallRecord(existingContainer);
                        let startFresh = false;
                        if (install?.status === 'pending' &&
                            installProcessMayBeRunning(install.childPid) &&
                            !privateWorkingRoots.has(manifest.rootPath) &&
                            !dependencyInstalls.has(manifest.rootPath) &&
                            !devServers.has(manifest.rootPath) &&
                            !startingDevServers.has(manifest.rootPath)) {
                            const { journal } = await readPrivateJournal(existingContainer, existing.copyId);
                            const copied = await collectHandoffState(manifest.rootPath);
                            if (install.copyId === existing.copyId && install.generatedLockOwner &&
                                !manifest.snapshot.some((entry) => entry.path === 'bun.lock')) {
                                const generated = await currentFile(path.join(manifest.rootPath, 'bun.lock'));
                                if (matchesGeneratedInstallLock(generated, install.generatedLockOwner)) {
                                    copied.delete('bun.lock');
                                }
                            }
                            const baseline = new Map(manifest.snapshot
                                .filter((entry) => !entry.path.split('/').includes('.next'))
                                .map((entry) => [entry.path, entry.sha256]));
                            startFresh = !journal.intent && !journal.writes.length &&
                                sameHandoffFiles(baseline, copied);
                        }
                        if (!startFresh) {
                            await checkCliCleanup(manifest.rootPath, existingContainer);
                            await grantLocalRoot(manifest.rootPath);
                            privateWorkingRoots.add(manifest.rootPath);
                            privateWorkingCopyRecords.set(manifest.rootPath, {
                                sourceRootPath: sourceRoot, record: existing,
                                container: existingContainer,
                            });
                            return {
                                rootPath: manifest.rootPath, sourceRootPath: sourceRoot,
                                copyId: existing.copyId, reused: true,
                                previewNeedsInstall: manifest.previewNeedsInstall,
                                excludedPaths: manifest.excludedPaths,
                                exclusions: manifest.exclusions ?? [],
                            };
                        }
                    }
                    priorCopyId = existing.copyId;
                } catch (err) {
                    throw new Error(`Existing private working copy is inconsistent: ${err.message}`);
                }
            }
            const sourceBefore = await sourceGitSnapshot(sourceRoot);
            const linked = sourceBefore.layout.kind === 'linked-worktree';
            const inventory = await inventoryPrivateCopySource(sourceRoot, linked);
            const copyId = randomUUID();
            const container = path.join(base, copyId);
            const rootPath = path.join(container, 'project');
            await fsp.mkdir(container, { mode: 0o700 });
            try {
                await fsp.mkdir(rootPath, { mode: 0o700 });
                const hashes = new Map();
                const baseline = [];
                let baselineBytes = 0;
                for (const entry of inventory.entries) {
                    const destination = path.join(rootPath, entry.rel);
                    if (entry.type === 'directory') {
                        await fsp.mkdir(destination, { mode: 0o700 });
                        continue;
                    }
                    const digest = await copySnapshotFile(
                        path.join(sourceRoot, entry.rel), destination, entry.stat,
                    );
                    hashes.set(entry.rel, digest);
                    if (entry.rel === '.git' || entry.rel.startsWith(`.git${path.sep}`) ||
                        !isBaselineTextPath(entry.rel)) continue;
                    if (entry.stat.size > BigInt(PRIVATE_COPY_MAX_TEXT_FILE_BYTES)) {
                        throw new Error(`Text source exceeds the 2 MB baseline limit: ${entry.rel}`);
                    }
                    const bytes = await fsp.readFile(destination);
                    if (bytes.includes(0)) throw new Error(`Binary content in text source: ${entry.rel}`);
                    let content;
                    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
                    catch { throw new Error(`Invalid UTF-8 text source: ${entry.rel}`); }
                    baselineBytes += bytes.length;
                    if (baselineBytes > PRIVATE_COPY_MAX_BASELINE_BYTES) {
                        throw new Error('Text source baseline exceeds the 100 MB limit.');
                    }
                    baseline.push({ path: entry.rel.split(path.sep).join('/'), sha256: digest, content });
                }
                await verifyPrivateCopySnapshot(sourceRoot, rootPath, inventory, hashes, linked);
                if (linked) {
                    await materializeLinkedWorktreeGit(rootPath, sourceRoot, sourceBefore.head,
                        sourceBefore.layout.branch, container);
                }
                await validateIndependentGitRoot(rootPath);
                const sourceAfter = await sourceGitSnapshot(sourceRoot, sourceBefore.layout);
                const sourceGitHead = sourceAfter.head;
                if (sourceAfter.head !== sourceBefore.head ||
                    sourceAfter.indexSha256 !== sourceBefore.indexSha256) {
                    throw new Error('Source Git HEAD or index changed during private copy. Try again.');
                }
                if (sourceGitHead !== await gitHead(rootPath)) {
                    throw new Error('Git HEAD changed during private copy. Try again.');
                }
                const manifest = {
                    version: linked ? 2 : 1, copyId, sourceRootPath: sourceRoot, rootPath,
                    createdAt: new Date().toISOString(), baseline,
                    sourceGitHead,
                    sourceIndexSha256: sourceAfter.indexSha256,
                    ...(linked ? { sourceGitLayout: sourceAfter.layout } : {}),
                    snapshot: inventory.entries
                        .filter((entry) => entry.type === 'file' &&
                            entry.rel !== '.git' && !entry.rel.startsWith(`.git${path.sep}`))
                        .map((entry) => ({
                            path: entry.rel.split(path.sep).join('/'),
                            sha256: hashes.get(entry.rel),
                        })),
                    excludedPaths: inventory.excludedPaths,
                    exclusions: inventory.exclusions,
                    previewNeedsInstall: inventory.exclusions.some((entry) => entry.reason === 'dependencies'),
                };
                const manifestBytes = Buffer.from(JSON.stringify(manifest));
                const manifestPath = path.join(container, 'baseline.json');
                const manifestHandle = await fsp.open(manifestPath, 'wx', 0o400);
                try {
                    await manifestHandle.writeFile(manifestBytes);
                    await manifestHandle.sync();
                } finally {
                    await manifestHandle.close();
                }
                await fsp.chmod(manifestPath, 0o400);
                await writePrivateJsonFile(container, 'write-journal.json', {
                    version: 1, copyId, writes: [], intent: null,
                });
                await grantLocalRoot(rootPath);
                if (priorCopyId) {
                    index.retired[priorCopyId] = {
                        ...existing, sourceRootPath: sourceRoot,
                    };
                }
                index.copies[sourceRoot] = { copyId, manifestSha256: sha256(manifestBytes) };
                await writePrivateCopyIndex(base, index);
                privateWorkingRoots.add(rootPath);
                privateWorkingCopyRecords.set(rootPath, {
                    sourceRootPath: sourceRoot, record: index.copies[sourceRoot], container,
                });
                return {
                    rootPath, sourceRootPath: sourceRoot, copyId, reused: false,
                    ...(priorCopyId ? {
                        priorCopyId, priorRootPath: path.join(base, priorCopyId, 'project'),
                    } : {}),
                    previewNeedsInstall: manifest.previewNeedsInstall,
                    excludedPaths: manifest.excludedPaths,
                                exclusions: manifest.exclusions ?? [],
                };
            } catch (err) {
                await fsp.rm(container, { recursive: true, force: true });
                throw err;
            }
        } finally {
            await releaseLock();
        }
    });
    privateCopyQueue = operation;
    return operation;
}

async function requirePrivateWorkingRoot(root, base = privateWorkingCopyBase()) {
    const canonical = await requireGrantedRoot(root);
    if (privateWorkingRoots.has(canonical)) {
        const known = privateWorkingCopyRecords.get(canonical);
        if (known) await checkCliCleanup(canonical, known.container);
        return canonical;
    }
    await preparePrivateCopyBase(base);
    const index = await readPrivateCopyIndex(base);
    const record = [
        ...Object.entries(index.copies),
        ...Object.values(index.retired).map((item) => [item.sourceRootPath, item]),
    ].find(([, item]) => path.join(base, item.copyId, 'project') === canonical);
    if (!record) throw new Error('original_git_root_is_read_only');
    await readPrivateCopyManifest(base, record[0], record[1]);
    privateWorkingRoots.add(canonical);
    privateWorkingCopyRecords.set(canonical, {
        sourceRootPath: record[0], record: record[1],
        container: path.join(base, record[1].copyId),
    });
    await checkCliCleanup(canonical, path.join(base, record[1].copyId));
    return canonical;
}

async function assertPrivateCredentialsAbsent(root) {
    let visited = 0;
    const visit = async (relative) => {
        for (const name of (await fsp.readdir(path.join(root, relative))).sort()) {
            if (['.git', 'node_modules', '.next'].includes(name)) continue;
            const file = relative ? path.join(relative, name) : name;
            if (++visited > PRIVATE_COPY_MAX_FILES) throw new Error('Private credential check exceeds its file limit.');
            if (privateCredentialPath(file)) throw new Error('Live credentials are not allowed in this private preview. Use separate preview settings.');
            const stat = await fsp.lstat(path.join(root, file));
            if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Private preview contains an unsafe path.');
            if (stat.isDirectory()) await visit(file);
        }
    };
    await visit('');
}

const HANDOFF_MAX_CHANGED_FILES = 100;
const HANDOFF_MAX_DIFF_BYTES = 10 * 1024 * 1024;
const HANDOFF_IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.next']);
// Files that framework tooling rewrites on its own (Next writes next-env.d.ts
// on every `next dev`; incremental TypeScript writes tsconfig.tsbuildinfo).
// They are never designer edits, so an unjournaled change to them must not
// block the handoff, and they stay out of the exported patch.
const HANDOFF_GENERATED_FILES = ['next-env.d.ts', 'tsconfig.tsbuildinfo'];

function ignoreGeneratedHandoffFiles(state, manifest, journal) {
    for (const file of HANDOFF_GENERATED_FILES) {
        if (journal.writes.some((entry) => entry.path === file)) continue;
        const baseline = manifest.snapshot.find((entry) => entry.path === file);
        if (baseline) state.set(file, baseline.sha256);
        else state.delete(file);
    }
}
const reviewedHandoffPlans = new Map(); // copyId -> token

async function collectHandoffState(root, { original = false } = {}) {
    const collect = async () => {
        const entries = [];
        let totalBytes = 0n;
        const rootStat = await fsp.lstat(root, { bigint: true });
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Project root changed.');
        const visit = async (directory) => {
            const abs = directory ? path.join(root, directory) : root;
            for (const name of (await fsp.readdir(abs)).sort()) {
                if (HANDOFF_IGNORED_DIRECTORIES.has(name)) continue;
                const rel = directory ? path.join(directory, name) : name;
                if (privateCredentialPath(rel)) {
                    if (original) continue;
                    throw new Error('Private credential files cannot be previewed or handed off.');
                }
                const stat = await fsp.lstat(path.join(root, rel), { bigint: true });
                if (stat.isSymbolicLink()) throw new Error(`Symlink in handoff source: ${rel}`);
                if (!stat.isDirectory() && !stat.isFile()) {
                    throw new Error(`Special file in handoff source: ${rel}`);
                }
                entries.push({ rel, type: stat.isDirectory() ? 'directory' : 'file', stat });
                if (entries.length > PRIVATE_COPY_MAX_FILES) throw new Error('Handoff source exceeds the file limit.');
                if (stat.isDirectory()) await visit(rel);
                else {
                    totalBytes += stat.size;
                    if (totalBytes > BigInt(PRIVATE_COPY_MAX_BYTES)) {
                        throw new Error('Handoff source exceeds the 2 GB size limit.');
                    }
                }
            }
        };
        await visit('');
        return { rootStat, entries };
    };
    const first = await collect();
    const files = new Map();
    for (const entry of first.entries) {
        if (entry.type !== 'file') continue;
        const relative = entry.rel.split(path.sep).join('/');
        files.set(relative, await hashSnapshotFile(path.join(root, entry.rel), entry.stat));
    }
    const second = await collect();
    if (!sameSnapshotStat(first.rootStat, second.rootStat) ||
        first.entries.length !== second.entries.length ||
        first.entries.some((entry, index) => entry.rel !== second.entries[index].rel ||
            entry.type !== second.entries[index].type ||
            !sameSnapshotStat(entry.stat, second.entries[index].stat))) {
        throw new Error('Files changed while preparing the handoff. Review again.');
    }
    return files;
}

function sameHandoffFiles(snapshot, current) {
    if (snapshot.size !== current.size) return false;
    for (const [path, hash] of snapshot) if (current.get(path) !== hash) return false;
    return true;
}

async function originalMatchesPrivateBaseline(sourceRoot, manifest) {
    const baseline = new Map(manifest.snapshot
        .filter((entry) => !entry.path.split('/').includes('.next'))
        .map((entry) => [entry.path, entry.sha256]));
    const current = await collectHandoffState(sourceRoot, { original: true });
    if (!sameHandoffFiles(baseline, current)) return false;
    const source = await sourceGitSnapshot(sourceRoot);
    return source.indexSha256 === manifest.sourceIndexSha256 &&
        source.head === manifest.sourceGitHead &&
        (!manifest.sourceGitLayout ||
            JSON.stringify(source.layout) === JSON.stringify(manifest.sourceGitLayout));
}

async function computePrivateHandoffPlan(copyRoot, base = privateWorkingCopyBase()) {
    copyRoot = await requirePrivateWorkingRoot(copyRoot, base);
    return withJournalLease(copyRoot, base, () => computePrivateHandoffPlanUnlocked(copyRoot, base));
}

async function computePrivateHandoffPlanUnlocked(copyRoot, base, { allowUnchanged = false, release = false, recapture = false } = {}) {
    copyRoot = await requirePrivateWorkingRoot(copyRoot, base);
    const { sourceRootPath, record, manifest, container } =
        await privateCopyRecordForRoot(copyRoot, base);
    await assertNoPendingSiteInstall(copyRoot, base);
    const siteInstall = release ? await (recapture ? retainedSiteForRecapture(copyRoot, base) : assertRetainedSanitySiteReady(copyRoot, base)) : null;
    const activeAssets = new Set((siteInstall?.artifact.files ?? []).filter((entry) => entry.kind === 'asset').map((entry) => entry.path));
    const ownedAssets = new Map((siteInstall ? [...siteInstall.history, siteInstall] : []).flatMap((item) =>
        item.artifact.files.filter((entry) => entry.kind === 'asset').map((entry) => [entry.path, entry])));
    await reconcilePrivateWriteIntent(copyRoot, base);
    const journalBefore = await readPrivateJournal(container, record.copyId);
    const copied = await collectHandoffState(copyRoot);
    const installRecord = await readDependencyInstallRecord(container);
    if (installRecord?.status === 'pending' && installRecord.copyId === record.copyId &&
        installRecord.generatedLockOwner &&
        !manifest.snapshot.some((entry) => entry.path === 'bun.lock')) {
        const generated = await currentFile(path.join(copyRoot, 'bun.lock'));
        if (matchesGeneratedInstallLock(generated, installRecord.generatedLockOwner)) {
            copied.delete('bun.lock');
        }
    }
    await inspectSourceGitLayout(sourceRootPath);
    const original = await collectHandoffState(sourceRootPath, { original: true });
    ignoreGeneratedHandoffFiles(copied, manifest, journalBefore.journal);
    ignoreGeneratedHandoffFiles(original, manifest, journalBefore.journal);
    const journalAfter = await readPrivateJournal(container, record.copyId);
    if (journalBefore.hash !== journalAfter.hash) {
        throw new Error('Weblab wrote a file while the handoff was being reviewed. Review again.');
    }
    const snapshot = new Map(manifest.snapshot
        .filter((entry) => !entry.path.split('/').includes('.next'))
        .map((entry) => [entry.path, entry.sha256]));
    const baseline = new Map(manifest.baseline.map((entry) => [entry.path, entry]));
    const writes = new Map(journalBefore.journal.writes.map((entry) => [entry.path, entry.sha256]));
    const unsupportedChanges = new Set();
    const changedFiles = [];
    const binaryFiles = [];
    let diffBytes = 0;

    for (const [filePath, expected] of writes) {
        const current = copied.get(filePath) ?? null;
        if (filePath.split('/').includes('.next') || current !== expected) {
            unsupportedChanges.add(filePath);
        }
    }
    for (const filePath of new Set([...snapshot.keys(), ...copied.keys()])) {
        const beforeHash = snapshot.get(filePath) ?? null;
        const afterHash = copied.get(filePath) ?? null;
        if (beforeHash === afterHash) continue;
        if (!writes.has(filePath) || writes.get(filePath) !== afterHash) {
            unsupportedChanges.add(filePath);
            continue;
        }
        const ownedAsset = ownedAssets.get(filePath);
        if (ownedAsset && afterHash === ownedAsset.sha256) {
            if (activeAssets.has(filePath)) binaryFiles.push({ path: filePath, sha256: afterHash, size: ownedAsset.bytes.length });
            continue;
        }
        const prior = baseline.get(filePath);
        if (beforeHash !== null && (!prior || prior.sha256 !== beforeHash)) {
            unsupportedChanges.add(filePath); // binary or unsupported source
            continue;
        }
        let updated = null;
        if (afterHash !== null) {
            const file = await readTextFile(copyRoot, filePath);
            if (file.error || file.sha256 !== afterHash) {
                unsupportedChanges.add(filePath);
                continue;
            }
            updated = file.content;
        }
        const oldContent = prior?.content ?? null;
        diffBytes += Buffer.byteLength(oldContent ?? '') + Buffer.byteLength(updated ?? '');
        if (changedFiles.length >= HANDOFF_MAX_CHANGED_FILES || diffBytes > HANDOFF_MAX_DIFF_BYTES) {
            throw new Error('Handoff diff exceeds 100 files or 10 MB.');
        }
        changedFiles.push({ path: filePath, original: oldContent, updated });
    }
    changedFiles.sort((a, b) => a.path.localeCompare(b.path));
    binaryFiles.sort((a, b) => a.path.localeCompare(b.path));
    const sourceChanged = !sameHandoffFiles(snapshot, original);
    const sourceGit = await sourceGitSnapshot(sourceRootPath, manifest.sourceGitLayout);
    const sourceGitChanged = sourceGit.head !== manifest.sourceGitHead ||
        sourceGit.indexSha256 !== manifest.sourceIndexSha256;
    const issues = [...unsupportedChanges].sort();
    const planToken = issues.length || sourceChanged || sourceGitChanged || (!changedFiles.length && !allowUnchanged) ? null : sha256(Buffer.from(JSON.stringify({
        copyId: record.copyId,
        manifestSha256: record.manifestSha256,
        journalSha256: journalBefore.hash,
        copied: [...copied].sort(),
        original: [...original].sort(),
        changedFiles,
        ...(siteInstall ? { binaryFiles, cmsInstallSha256: siteInstall.hash } : {}),
    })));
    return {
        copyId: record.copyId, sourceRootPath, changedFiles,
        ...(release ? { binaryFiles, cmsInstallManifestHash: siteInstall?.artifact.manifestHash ?? null } : {}),
        unsupportedChanges: issues, sourceChanged: sourceChanged || sourceGitChanged, planToken,
    };
}

async function planPrivateHandoff(copyRoot, base = privateWorkingCopyBase()) {
    const plan = await computePrivateHandoffPlan(copyRoot, base);
    if (plan.planToken) reviewedHandoffPlans.set(plan.copyId, plan.planToken);
    else reviewedHandoffPlans.delete(plan.copyId);
    return plan;
}

async function planPrivateRelease(copyRoot, base = privateWorkingCopyBase()) {
    copyRoot = await requirePrivateWorkingRoot(copyRoot, base);
    const plan = await withJournalLease(copyRoot, base, () =>
        computePrivateHandoffPlanUnlocked(copyRoot, base, { allowUnchanged: true, release: true }));
    if (plan.planToken) reviewedHandoffPlans.set(plan.copyId, plan.planToken);
    else reviewedHandoffPlans.delete(plan.copyId);
    return plan;
}

async function validatePrivateReleaseSnapshot(copyRoot, copyId, planToken, base = privateWorkingCopyBase()) {
    copyRoot = await requirePrivateWorkingRoot(copyRoot, base);
    return withJournalLease(copyRoot, base, async () => {
        const current = await computePrivateHandoffPlanUnlocked(copyRoot, base, { allowUnchanged: true, release: true });
        if (current.copyId !== copyId || current.planToken !== planToken || current.sourceChanged || current.unsupportedChanges.length) {
            throw new Error('Project files changed since publication review. Review again.');
        }
        return true;
    });
}

function isolatedGit(args, cwd, templateDirectory, timeout = 0) {
    return new Promise((resolve, reject) => {
        const env = { ...syncedEnv() };
        for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
        env.GIT_CONFIG_NOSYSTEM = '1';
        env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
        env.GIT_TEMPLATE_DIR = templateDirectory;
        execFile('git', [
            '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
            '-c', 'core.fsmonitor=false',
            '-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
            ...args,
        ], { cwd, env, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout },
        (err, stdout, stderr) => {
            if (err) return reject(new Error(`Isolated Git patch failed: ${stderr.toString('utf8').trim() || err.message}`));
            resolve(stdout);
        });
    });
}

async function buildIsolatedHandoffPatch(container, changedFiles) {
    const temporary = path.join(container, `handoff-tmp-${randomUUID()}`);
    const repository = path.join(temporary, 'repo');
    const template = path.join(temporary, 'empty-template');
    await fsp.mkdir(temporary, { mode: 0o700 });
    try {
        await fsp.mkdir(repository, { mode: 0o700 });
        await fsp.mkdir(template, { mode: 0o700 });
        await isolatedGit(['init', '-q', `--template=${template}`], repository, template);
        // Git's info/attributes outranks any changed .gitattributes file.
        // Disable text conversion and filters so patch bytes match the
        // reviewed UTF-8 content exactly, including CRLF and BOM.
        await fsp.mkdir(path.join(repository, '.git', 'info'), { recursive: true, mode: 0o700 });
        await fsp.writeFile(path.join(repository, '.git', 'info', 'attributes'), '* -text -filter\n', {
            flag: 'wx', mode: 0o600,
        });
        for (const file of changedFiles) {
            if (file.original === null) continue;
            const target = resolveWithin(repository, file.path);
            await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
            await fsp.writeFile(target, file.original, { flag: 'wx', mode: 0o600 });
            await isolatedGit(['add', '-f', '--', file.path], repository, template);
        }
        for (const file of changedFiles) {
            const target = resolveWithin(repository, file.path);
            if (file.updated === null) {
                await fsp.rm(target);
            } else if (file.original === null) {
                await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
                await fsp.writeFile(target, file.updated, { flag: 'wx', mode: 0o600 });
                await isolatedGit(['add', '-N', '-f', '--', file.path], repository, template);
            } else {
                await fsp.writeFile(target, file.updated);
            }
        }
        const patch = await isolatedGit([
            'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', '--',
        ], repository, template);
        if (!patch.length || !patch.toString('utf8').includes('diff --git')) {
            throw new Error('Isolated Git produced no handoff patch.');
        }
        return patch;
    } finally {
        await fsp.rm(temporary, { recursive: true, force: true });
    }
}

/**
 * The renderer strips editor instrumentation (data-oid, bootstrap scripts,
 * reprint formatting) before export. Overrides may only narrow the reviewed
 * plan: same paths, no new files, no deletions the plan did not contain.
 */
function applyHandoffOverrides(changedFiles, overrides, { allowUnchanged = false } = {}) {
    if (overrides === undefined || overrides === null) return changedFiles;
    if (!Array.isArray(overrides) || overrides.length > HANDOFF_MAX_CHANGED_FILES) {
        throw new Error('Invalid cleaned handoff files.');
    }
    const reviewed = new Map(changedFiles.map((file) => [file.path, file]));
    const seen = new Set();
    const out = [];
    let bytes = 0;
    for (const item of overrides) {
        if (!item || typeof item.path !== 'string' || seen.has(item.path)) {
            throw new Error('Invalid cleaned handoff files.');
        }
        seen.add(item.path);
        const planned = reviewed.get(item.path);
        if (!planned) throw new Error(`Cleaned handoff file is not in the reviewed plan: ${item.path}`);
        if (item.updated !== null && typeof item.updated !== 'string') {
            throw new Error('Invalid cleaned handoff files.');
        }
        if (item.updated === null && planned.updated !== null) {
            throw new Error('A cleaned handoff cannot delete a file the plan kept.');
        }
        bytes += Buffer.byteLength(item.updated ?? '');
        if (bytes > HANDOFF_MAX_DIFF_BYTES) throw new Error('Handoff diff exceeds 100 files or 10 MB.');
        if (item.updated === planned.original) continue;
        out.push({ path: item.path, original: planned.original, updated: item.updated });
    }
    if (!out.length && !allowUnchanged) throw new Error('The cleaned handoff has no changes to export.');
    return out;
}

async function exportPrivateHandoff(copyRoot, planToken, base = privateWorkingCopyBase(), overrides = undefined) {
    copyRoot = await requirePrivateWorkingRoot(copyRoot, base);
    return withJournalLease(copyRoot, base, () => exportPrivateHandoffUnlocked(copyRoot, planToken, base, overrides));
}

async function exportPrivateHandoffUnlocked(copyRoot, planToken, base, overrides) {
    if (typeof planToken !== 'string' || !/^[a-f0-9]{64}$/.test(planToken)) {
        throw new Error('Review a current handoff plan before exporting.');
    }
    const first = await computePrivateHandoffPlan(copyRoot, base);
    if (reviewedHandoffPlans.get(first.copyId) !== planToken || first.planToken !== planToken ||
        first.unsupportedChanges.length || first.sourceChanged || !first.changedFiles.length) {
        throw new Error('Project files changed since handoff review. Review again.');
    }
    const container = path.join(base, first.copyId);
    const exportedFiles = applyHandoffOverrides(first.changedFiles, overrides);
    const patch = await buildIsolatedHandoffPatch(container, exportedFiles);
    const second = await computePrivateHandoffPlan(copyRoot, base);
    if (second.planToken !== planToken) {
        throw new Error('Project files changed while exporting. Review again.');
    }
    const exportDirectory = path.join(container, 'exports');
    await fsp.mkdir(exportDirectory, { recursive: true, mode: 0o700 });
    const patchPath = path.join(exportDirectory, `${Date.now()}-${randomUUID()}.patch`);
    const handle = await fsp.open(patchPath, 'wx', 0o600);
    try {
        await handle.writeFile(patch);
        await handle.sync();
    } catch (err) {
        await fsp.rm(patchPath, { force: true });
        throw err;
    } finally {
        await handle.close();
    }
    reviewedHandoffPlans.delete(first.copyId);
    return { patchPath, changedFiles: exportedFiles.map((file) => file.path) };
}


/** Freeze original baseline bytes plus reviewed, cleaned edits, never private instrumentation. */
async function createPrivateReleaseSnapshot(root, planToken, cleanedOverrides, base = privateWorkingCopyBase()) {
    if (typeof planToken !== 'string' || !/^[a-f0-9]{64}$/.test(planToken) ||
        !Array.isArray(cleanedOverrides) || cleanedOverrides.length > HANDOFF_MAX_CHANGED_FILES) {
        throw new Error('Review cleaned release files before publishing.');
    }
    const overrides = cleanedOverrides.map((item) => ({ path: item?.path, updated: item?.updated }));
    root = await requirePrivateWorkingRoot(root, base);
    const snapshot = await withWriteLock('journal:' + root, () => withJournalLease(root, base, async () => {
        const { releasePathAllowed } = require('./release/policy');
        const { sourceRootPath, record, manifest, container } = await privateCopyRecordForRoot(root, base);
        const pending = await readPrivateJournal(container, record.copyId);
        if (pending.journal.intent) throw new Error('A private write needs recovery before publishing.');
        const first = await computePrivateHandoffPlanUnlocked(root, base, { allowUnchanged: true, release: true });
        if (reviewedHandoffPlans.get(record.copyId) !== planToken || first.planToken !== planToken ||
            first.sourceChanged || first.unsupportedChanges.length) {
            throw new Error('Project files changed since release review. Review again.');
        }
        const installedSite = await assertRetainedSanitySiteReady(root, base);
        const pinnedText = new Map((installedSite?.artifact.files ?? []).filter((file) => file.kind === 'text')
            .map((file) => [file.path, file.bytes.toString('utf8')]));
        if (overrides.some((file) => pinnedText.has(file.path) && file.updated !== pinnedText.get(file.path))) {
            throw new Error('Retained website files cannot be changed by release cleanup.');
        }
        if (overrides.length !== first.changedFiles.length ||
            new Set(overrides.map((item) => item.path)).size !== overrides.length ||
            first.changedFiles.some((item) => !overrides.some((override) => override.path === item.path))) {
            throw new Error('Every reviewed release file needs a cleaned version.');
        }
        for (const item of overrides) {
            if (path.posix.basename(item.path) === '.gitignore') {
                const planned = first.changedFiles.find((file) => file.path === item.path);
                if (item.updated !== planned.updated && item.updated !== planned.original) {
                    throw new Error('Release cleanup cannot change Git ignore rules.');
                }
            }
        }
        const changes = first.changedFiles.length ? applyHandoffOverrides(first.changedFiles, overrides, { allowUnchanged: true }) : [];
        const paths = [...new Set([...manifest.snapshot.map((item) => item.path), ...changes.map((item) => item.path), ...first.binaryFiles.map((item) => item.path)])];
        const allowed = paths.filter(releasePathAllowed);
        if (allowed.length > 10_000) throw new Error('Release exceeds the file limit.');
        const sourceIgnored = await gitIgnoredPaths(sourceRootPath, allowed, { noIndex: true });
        const privateIgnored = await gitIgnoredPaths(root, allowed, { noIndex: true });
        if (!sourceIgnored || !privateIgnored) throw new Error('Release ignore rules could not be verified.');
        const skippedPaths = paths.filter((rel) => !releasePathAllowed(rel) ||
            sourceIgnored.has(rel) || privateIgnored.has(rel)).sort();
        const skipped = new Set(skippedPaths);
        const files = new Map();
        let total = 0;
        const put = (rel, bytes) => {
            const prior = files.get(rel);
            total -= prior?.bytes.length ?? 0;
            if (bytes === null) { files.delete(rel); return; }
            total += bytes.length;
            if (bytes.length > 32 * 1024 * 1024 || total > 100 * 1024 * 1024) {
                throw new Error('Release exceeds the upload size limit.');
            }
            files.set(rel, { path: rel, bytes: Buffer.from(bytes), sha256: sha256(bytes) });
        };
        for (const entry of manifest.snapshot) {
            if (skipped.has(entry.path)) continue;
            const abs = resolveWithin(sourceRootPath, entry.path);
            await rejectSymlinkPath(sourceRootPath, abs);
            await verifyExistingParent(sourceRootPath, abs);
            const file = await currentFile(abs, 32 * 1024 * 1024);
            if (file.hash !== entry.sha256 || !file.bytes) {
                throw new Error('Original source changed while preparing the release.');
            }
            put(entry.path, file.bytes);
        }
        for (const item of changes) {
            if (skipped.has(item.path)) continue;
            put(item.path, item.updated === null ? null : Buffer.from(item.updated, 'utf8'));
        }
        for (const item of first.binaryFiles) {
            if (skipped.has(item.path)) throw new Error('A retained Sanity website asset cannot be excluded from the release.');
            const abs = resolveWithin(root, item.path);
            await rejectSymlinkPath(root, abs);
            await verifyExistingParent(root, abs);
            const current = await currentFile(abs, 32 * 1024 * 1024);
            if (!current.bytes || current.hash !== item.sha256 || current.bytes.length !== item.size) {
                throw new Error('A retained Sanity website asset changed while preparing the release.');
            }
            put(item.path, current.bytes);
        }
        const second = await computePrivateHandoffPlanUnlocked(root, base, { allowUnchanged: true, release: true });
        const sourceIgnoredAfter = await gitIgnoredPaths(sourceRootPath, allowed, { noIndex: true });
        const privateIgnoredAfter = await gitIgnoredPaths(root, allowed, { noIndex: true });
        const sameIgnore = (before, after) => after && before.size === after.size &&
            [...before].every((rel) => after.has(rel));
        if (second.sourceChanged) throw new Error('Original source changed while preparing the release.');
        if (second.unsupportedChanges.length || second.planToken !== planToken) throw new Error('Project files changed while preparing the release.');
        if (!sameIgnore(sourceIgnored, sourceIgnoredAfter) || !sameIgnore(privateIgnored, privateIgnoredAfter)) {
            throw new Error('Git ignore rules could not be confirmed while preparing the release.');
        }
        const frozen = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
        if (!frozen.length) throw new Error('The release has no supported files.');
        const snapshotSha256 = sha256(Buffer.from(JSON.stringify(frozen.map((file) => [file.path, file.sha256]))));
        return { copyId: record.copyId, files: frozen, size: total, snapshotSha256, skippedPaths,
            includedPaths: frozen.map((file) => file.path), changedFiles: [...changes.filter((file) => !skipped.has(file.path)).map((file) => file.path), ...first.binaryFiles.map((file) => file.path)],
            binaryFiles: first.binaryFiles, cmsInstallManifestHash: first.cmsInstallManifestHash };
    }));
    if (reviewedHandoffPlans.get(snapshot.copyId) === planToken) reviewedHandoffPlans.delete(snapshot.copyId);
    return snapshot;
}

// --- Watch --------------------------------------------------------------------
const watchers = new Map(); // watchId -> { watcher, root }
let watchSeq = 0;

async function startWatch(root, excludes, getWebContents) {
    if (!chokidar) return { error: 'chokidar_unavailable' };
    const id = `w${++watchSeq}`;
    const ignored = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        ...(Array.isArray(excludes) ? excludes : []),
    ];
    let watcher;
    try {
        watcher = chokidar.watch(root, { ignored, ignoreInitial: true, persistent: true, followSymlinks: false });
    } catch (err) {
        return { error: (err && err.message) || 'watch_failed' };
    }
    const emit = (type, absPath) => {
        const wc = getWebContents();
        if (!wc) return;
        try {
            wc.send('weblab:localfs:watch-event', {
                watchId: id,
                event: { type, paths: [path.relative(root, absPath)] },
            });
        } catch {
            // window closed
        }
    };
    watcher.on('add', (p) => emit('add', p));
    watcher.on('change', (p) => emit('change', p));
    watcher.on('unlink', (p) => emit('remove', p));
    watchers.set(id, { watcher, root });
    // Wait for chokidar's initial scan to finish before resolving, so edits
    // made right after watchStart aren't dropped during startup. Fallback after
    // 3s so a watcher that never emits 'ready' can't hang the caller.
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        watcher.once('ready', done);
        setTimeout(done, 3000);
    });
    return { watchId: id };
}

function stopWatch(watchId) {
    const rec = watchers.get(watchId);
    if (rec) {
        try {
            rec.watcher.close();
        } catch {
            // ignore
        }
        watchers.delete(watchId);
    }
}

// --- Registration -------------------------------------------------------------
function registerLocalIpc({ allowedOrigins, getWebContents }) {
    const guard = (event) => event.sender === getWebContents() &&
        event.senderFrame === event.sender.mainFrame && isFromAllowedOrigin(event, allowedOrigins);
    const granted = async (event, root) => {
        if (!guard(event)) throw new Error('origin_mismatch');
        return requireGrantedRoot(root);
    };

    ipcMain.handle('weblab:localfs:pickFolder', async (event) => {
        if (!guard(event)) return null;
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        try { return { rootPath: await grantLocalRoot(result.filePaths[0]) }; }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:grantDroppedFolder', async (event, folderPath) => {
        if (!guard(event)) return null;
        try { return await grantLocalRoot(folderPath); }
        catch { return null; }
    });

    ipcMain.handle('weblab:localfs:createPrivateWorkingCopy', async (event, { sourceRoot } = {}) => {
        try { return await createPrivateWorkingCopy(await granted(event, sourceRoot)); }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:planPrivateHandoff', async (event, { root } = {}) => {
        try { return await planPrivateHandoff(await requirePrivateWorkingRoot(await granted(event, root))); }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:exportPrivateHandoff', async (event, { root, planToken, files } = {}) => {
        try {
            root = await requirePrivateWorkingRoot(await granted(event, root));
            return await withWriteLock(`journal:${root}`, () =>
                exportPrivateHandoff(root, planToken, privateWorkingCopyBase(), files));
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:read', async (event, { root, path: rel } = {}) => {
        try {
            return await readTextFile(await granted(event, root), rel);
        } catch (err) {
            return { error: err.code === 'ENOENT' ? 'not_found' : err.message, notFound: err.code === 'ENOENT' };
        }
    });

    for (const operation of ['write', 'mkdir', 'remove', 'rename', 'copy']) {
        ipcMain.handle(`weblab:localfs:${operation}`, async () => ({ error: 'unsupported_mutation' }));
    }

    ipcMain.handle('weblab:localfs:writeIfUnchanged', async (event, {
        root, path: rel, content, expectedSha256,
    } = {}) => {
        try {
            if (expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
                return { error: 'invalid_expected_sha256' };
            }
            root = await requirePrivateWorkingRoot(await granted(event, root));
            return await withWriteLock(`journal:${root}`, () => withJournalLease(root, privateWorkingCopyBase(), async () => {
                const intent = await beginPrivateWriteIntent(
                    root, rel, expectedSha256, sha256(toBytes(content)),
                );
                if (intent.conflict) return intent;
                const result = await writeIfUnchanged(root, rel, content, expectedSha256);
                try { await reconcilePrivateWriteIntent(root); }
                catch (err) {
                    return { error: `Private write needs recovery before handoff: ${err.message}`,
                        hash: result.hash, recoveryPath: result.recoveryPath };
                }
                return result;
            }));
        }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:deleteFileIfUnchanged', async (event, {
        root, path: rel, expectedSha256,
    } = {}) => {
        try {
            if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return { error: 'invalid_expected_sha256' };
            root = await requirePrivateWorkingRoot(await granted(event, root));
            return await withWriteLock(`journal:${root}`, () => withJournalLease(root, privateWorkingCopyBase(), async () => {
                const intent = await beginPrivateWriteIntent(root, rel, expectedSha256, null);
                if (intent.conflict) return intent;
                const result = await deleteFileIfUnchanged(root, rel, expectedSha256);
                try { await reconcilePrivateWriteIntent(root); }
                catch (err) {
                    return { error: `Private delete needs recovery before handoff: ${err.message}`,
                        recoveryPath: result.recoveryPath };
                }
                return result;
            }));
        }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:createPreparationPublicDirectory', async (event, { root } = {}) => {
        try { return await createPreparationPublicDirectory(await requirePrivateWorkingRoot(await granted(event, root))); }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:deletePreparationPublicDirectory', async (event, { root } = {}) => {
        try { return await deletePreparationPublicDirectory(await requirePrivateWorkingRoot(await granted(event, root))); }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localfs:list', async (event, { root, path: rel } = {}) => {
        try {
            root = await granted(event, root);
            const abs = resolveWithin(root, rel);
            await rejectSymlinkPath(root, abs);
            const entries = await fsp.readdir(abs, { withFileTypes: true });
            return {
                files: entries.map((e) => ({
                    name: e.name,
                    type: e.isDirectory() ? 'directory' : 'file',
                    isSymlink: e.isSymbolicLink(),
                })),
            };
        } catch (err) {
            return { error: err.message, files: [] };
        }
    });

    ipcMain.handle('weblab:localfs:stat', async (event, { root, path: rel } = {}) => {
        try {
            root = await granted(event, root);
            const abs = resolveWithin(root, rel);
            await rejectSymlinkPath(root, abs);
            const st = await fsp.lstat(abs);
            return {
                type: st.isDirectory() ? 'directory' : 'file',
                isSymlink: st.isSymbolicLink(),
                size: st.size,
                mtime: st.mtimeMs,
                ctime: st.ctimeMs,
            };
        } catch (err) {
            return { error: err.code === 'ENOENT' ? 'not_found' : err.message, notFound: err.code === 'ENOENT' };
        }
    });

    ipcMain.handle('weblab:localfs:watchStart', async (event, { root, excludes } = {}) => {
        try {
            root = await granted(event, root);
            await rejectSymlinkPath(root, root);
            return startWatch(root, excludes, getWebContents);
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:watchStop', async (event, { watchId } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        const rec = watchers.get(watchId);
        if (!rec) return { error: 'unknown_watch' };
        try { await granted(event, rec.root); }
        catch (err) { return { error: err.message }; }
        stopWatch(watchId);
        return { success: true };
    });

    ipcMain.handle('weblab:localdev:start', async (event, { root, port } = {}) => {
        try {
            if (localShuttingDown) return { error: 'Weblab is closing.' };
            root = await requirePrivateWorkingRoot(await granted(event, root));
            if (dependencyInstalls.has(root)) return { error: 'Wait for dependency installation to finish before starting the preview.' };
            const pending = pendingDevServerStarts.get(root);
            if (pending) return await pending;
            startingDevServers.add(root);
            const starting = (async () => {
                const privateCopy = privateWorkingCopyRecords.get(root);
                const container = privateCopy?.container;
                if (!container || !privateCopy) return { error: 'Private working copy registration is missing.' };
                if (!(await privateDependencyInstallIsCurrent(root, container, privateCopy.record.copyId))) {
                    return { error: 'Dependencies are not ready for this private copy. Install them in the editor before starting preview.' };
                }
                await verifyDependencyLinks(root, await privateInstallCache(container));
                return await startDevServer(root, null, port, getWebContents);
            })();
            pendingDevServerStarts.set(root, starting);
            try { return await starting; }
            finally {
                pendingDevServerStarts.delete(root);
                startingDevServers.delete(root);
            }
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localdev:installDependencies', async (event, { root } = {}) => {
        try {
            if (localShuttingDown) return { error: 'Weblab is closing.' };
            return await installDependencies(await granted(event, root));
        }
        catch (err) { return { error: err.message }; }
    });
    // Lets the editor skip the install step when this private copy already
    // has a current install, so opening a project needs no manual clicks.
    ipcMain.handle('weblab:localdev:dependenciesReady', async (event, { root } = {}) => {
        try {
            root = await requirePrivateWorkingRoot(await granted(event, root));
            const privateCopy = privateWorkingCopyRecords.get(root);
            if (!privateCopy?.container) return { error: 'Private working copy registration is missing.' };
            return {
                ready: await privateDependencyInstallIsCurrent(root, privateCopy.container, privateCopy.record.copyId),
            };
        } catch (err) { return { error: err.message }; }
    });
    ipcMain.handle('weblab:localdev:cancelInstallDependencies', async (event, { root } = {}) => {
        try {
            root = await requirePrivateWorkingRoot(await granted(event, root));
            const install = dependencyInstalls.get(root);
            if (!install) return { error: 'No dependency install is running.' };
            install.cancel();
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localdev:pickPort', async (event, { root, preferredPort } = {}) => {
        try {
            await granted(event, root);
            return { port: await findFreePort(preferredPort) };
        } catch (err) {
            return { error: (err && err.message) || 'pick_port_failed' };
        }
    });

    ipcMain.handle('weblab:localdev:stop', async (event, { root } = {}) => {
        try { return await stopDevServer(await granted(event, root)); }
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('weblab:localdev:status', async (event, { root } = {}) => {
        try { root = await granted(event, root); }
        catch (err) { return { error: err.message }; }
        const rec = devServers.get(root);
        const running = isDevServerRunning(rec);
        return { running, port: rec ? rec.port : undefined, url: rec ? rec.url : undefined };
    });

    ipcMain.handle('weblab:localdev:gitInfo', async (event, { root } = {}) => {
        try { return await gitInfo(await granted(event, root)); }
        catch (err) { return { isRepositoryRoot: false, error: err.message }; }
    });
    ipcMain.handle('weblab:localdev:gitStatus', async (event, { root } = {}) => {
        try { return await gitStatus(await granted(event, root)); }
        catch (err) { return { changedFiles: [], error: err.message }; }
    });
    ipcMain.handle('weblab:localdev:run', async () => {
        return { error: 'unsupported_command', output: '', exitCode: -1 };
    });
}

// Kill any spawned dev servers + watchers on app shutdown.
async function disposeLocal() {
    localShuttingDown = true;
    const stopping = [...dependencyInstalls.values()].map((install) => install.cancel());
    stopping.push(...[...devServers.keys()].map((root) => stopDevServer(root, true)));
    for (const id of [...watchers.keys()]) stopWatch(id);
    const results = await Promise.allSettled(stopping);
    const failures = results.flatMap((result) => result.status === 'rejected'
        ? [result.reason?.message || String(result.reason)]
        : result.value?.error ? [result.value.error] : []);
    if (failures.length) throw new Error(failures.join('; '));
}

// --- CLI agent edits -----------------------------------------------------------
// Claude Code / Codex edit the private copy directly, outside the renderer's
// journaled write path. After a turn we journal ONLY the paths the CLI itself
// reported editing, so dev-server output and unrelated files never reach the
// user's repo through the Git handoff. Gitignored, protected (.git, .claude,
// .codex, node_modules) and unsafe (symlinked, unreadable) paths are skipped
// and reported back so the chat can say why.
const CLI_PROTECTED_SEGMENTS = new Set(['.git', '.claude', '.codex', 'node_modules']);

function parseIgnoredPaths(result, rels) {
    if (!result || result.timedOut || result.aborted || result.truncated || result.error ||
        (result.code !== 0 && result.code !== 1) || typeof result.stdout !== 'string') return null;
    if (result.code === 1) return result.stdout === '' ? new Set() : null;
    if (!result.stdout || !result.stdout.endsWith('\0')) return null;
    const submitted = new Set(rels);
    const paths = result.stdout.slice(0, -1).split('\0');
    if (paths.some((rel) => !submitted.has(rel)) || new Set(paths).size !== paths.length) return null;
    return new Set(paths);
}

async function gitIgnoredPaths(root, rels, { capture = runCapture, signal, noIndex = false } = {}) {
    if (!rels.length) return new Set();
    if (rels.some((rel) => typeof rel !== 'string' || !rel || rel.includes('\0'))) return null;
    const env = { ...syncedEnv() };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    const result = await capture('git', ['-c', 'core.fsmonitor=false', '-C', root, 'check-ignore', '-z', '--stdin', ...(noIndex ? ['--no-index'] : [])], {
        env, cwd: root, signal, input: rels.join('\0') + '\0',
        timeoutMs: 8000, maxBytes: 1024 * 1024,
    });
    return parseIgnoredPaths(result, rels);
}

/** Pure filter: which reported paths may be journaled at all. */
function cliJournalCandidates(rels) {
    const seen = new Set();
    const out = [];
    for (const rel of Array.isArray(rels) ? rels : []) {
        if (typeof rel !== 'string' || !rel || rel.length > 4096 || rel.includes('\0') ||
            rel.startsWith('/') || rel.includes('\\')) continue;
        const parts = rel.split('/');
        if (parts.some((part) => !part || part === '.' || part === '..')) continue;
        if (parts.some((part) => CLI_PROTECTED_SEGMENTS.has(part.toLowerCase()))) continue;
        if (seen.has(rel)) continue;
        seen.add(rel);
        out.push(rel);
    }
    return out;
}

async function journalCliEdits(root, reportedPaths, base = privateWorkingCopyBase()) {
    root = await requirePrivateWorkingRoot(root, base);
    const candidates = cliJournalCandidates(reportedPaths);
    const skipped = [];
    if (candidates.length === 0) return { recorded: [], skipped };
    return withWriteLock(`journal:${root}`, () => withJournalLease(root, base, async () => {
        const ignored = await gitIgnoredPaths(root, candidates);
        if (ignored === null) {
            return { recorded: [], skipped: candidates.map((path) => ({ path, reason: 'ignore_detection_failed' })) };
        }
        const entries = [];
        for (const rel of candidates) {
            if (ignored.has(rel)) continue; // build output etc. never goes to the repo
            try {
                entries.push({ path: rel, sha256: await privatePathHash(root, rel) });
            } catch (err) {
                skipped.push({ path: rel, reason: err?.message ?? String(err) });
            }
        }
        if (entries.length === 0) return { recorded: [], skipped };
        const { record, container } = privateWorkingCopyRecords.get(root) ??
            await privateCopyRecordForRoot(root, base);
        const { journal } = await readPrivateJournal(container, record.copyId);
        if (journal.intent) {
            return { recorded: [], skipped: [...skipped, ...entries.map((e) => ({ path: e.path, reason: 'write_intent_pending' }))] };
        }
        const byPath = new Map(journal.writes.map((item) => [item.path, item]));
        for (const entry of entries) byPath.set(entry.path, entry);
        const writes = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
        await writePrivateJsonFile(container, 'write-journal.json', {
            version: 1, copyId: record.copyId, writes,
        });
        return { recorded: entries.map((e) => e.path), skipped };
    }));
}

module.exports = {
    registerLocalIpc,
    grantLocalRoot,
    requireGrantedRoot,
    disposeLocal,
    resolveWithin,
    rejectSymlinkPath,
    readTextFile,
    inferPortFromDevScript,
    findFreePort,
    canBindPort,
    // Exported for the headless integration test (real dev-server + watch).
    writeIfUnchanged,
    deleteFileIfUnchanged,
    createPreparationPublicDirectory,
    deletePreparationPublicDirectory,
    startDevServer,
    projectDevEnvironment,
    installDependencies,
    privateDependencyInstallIsCurrent,
    verifyDependencyLinks,
    stopDevServer,
    gitInfo,
    gitStatus,
    pruneSuccessfulBackups,
    startWatch,
    stopWatch,
    createPrivateWorkingCopy,
    requirePrivateWorkingRoot,
    planPrivateHandoff,
    planPrivateRelease,
    validatePrivateReleaseSnapshot,
    exportPrivateHandoff,
    applyHandoffOverrides,
    recordPrivateWrite,
    beginPrivateWriteIntent,
    reconcilePrivateWriteIntent,
    syncedEnv,
    cliJournalCandidates,
    journalCliEdits,
    quarantineCliCleanup,
    withCliTurn,
    withCliTurnMarker,
    checkCliCleanup,
    acquireJournalLease,
    recoverDeadJournalLock,
    gitIgnoredPaths,
    parseIgnoredPaths,
    createPrivateReleaseSnapshot,
    installRetainedSanitySite,
    resumeRetainedSanitySiteInstall,
    assertRetainedSanitySiteReady,
    readVerifiedSanitySiteSource,
    inspectRetainedSanitySiteInstall,
};
