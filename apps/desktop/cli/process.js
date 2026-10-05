/**
 * Shared process helpers for the CLI chat adapters (Claude Code, Codex).
 *
 * - `cliEnv()` uses the login-shell PATH so a Finder-launched app still finds
 *   Homebrew / npm-global binaries (same source as the local dev server).
 * - `resolveOnPath()` resolves an absolute binary path so we can spawn with
 *   `shell: false` everywhere (no argv re-parsing through a shell).
 * - `spawnCli()` starts the child in its own process group (POSIX) so
 *   `killTree()` can stop the CLI *and* anything it launched.
 */

const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { readProcessTable, sameProcess } = require('./process-identity');
const fs = require('fs');
const { delimiter, join, isAbsolute } = require('path');

function baseEnv() {
    try {
        // Lazy: weblab-local pulls in Electron; unit tests never reach here.
        return require('../weblab-local').syncedEnv();
    } catch {
        return process.env;
    }
}

const ENV_KEYS = new Set([
    'HOME', 'USER', 'LOGNAME', 'SHELL', 'PATH', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'TERM',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
    'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
    // Windows basics the CLIs need to start.
    'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE',
]);
const ENV_PREFIXES = ['LC_', 'XDG_', 'ANTHROPIC_', 'OPENAI_'];

/**
 * Environment for a CLI child: an allowlist (like the local dev server's),
 * so Weblab's own service credentials never reach the CLI. PATH comes from
 * the user's login shell.
 */
function pickCliEnv(source) {
    const env = {};
    for (const [key, value] of Object.entries(source ?? {})) {
        if (typeof value !== 'string') continue;
        if (ENV_KEYS.has(key) || ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) env[key] = value;
    }
    return env;
}

function cliEnv() {
    return pickCliEnv(baseEnv());
}

function resolveOnPath(name, env = cliEnv()) {
    const dirs = (env.PATH || '').split(delimiter);
    const exts = process.platform === 'win32'
        ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
        : [''];
    for (const dir of dirs) {
        if (!dir) continue;
        for (const ext of exts) {
            const candidate = join(dir, `${name}${ext}`);
            try {
                if (!fs.statSync(candidate).isFile()) continue;
                if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            } catch {
                // missing or not executable — keep looking
            }
        }
    }
    return null;
}


const lifecycles = new WeakMap();

function cleanupError(message) {
    const error = new Error(message);
    error.code = 'cleanup_unconfirmed';
    return error;
}

/** Capture identities while the parent is alive; never kill a reused PID. */
function createChildLifecycle(child, {
    readTable = readProcessTable, signalPid = (pid, signal) => process.kill(pid, signal),
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now, pollMs = 250,
    expectedUid = null,
    launchGate = false, launchWaitMs = 3000,
} = {}) {
    const owned = new Map();
    let parentExited = !child.pid;
    let closed = false;
    let trackingFailure = null;
    let unknownDescendant = false;
    let lastTable = new Map();
    let sampling = null;
    let stopping = null;
    const parentPid = child.pid;
    let resolveClosed;
    const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });
    child.once('exit', () => { parentExited = true; });
    child.once('error', () => { if (!child.pid) parentExited = true; });
    child.once('close', () => { closed = true; parentExited = true; resolveClosed(); });

    const observe = () => {
        if (sampling) return sampling;
        const sample = (async () => {
            const table = await readTable();
            lastTable = table;
            const root = table.get(parentPid);
            if (root && !owned.has(parentPid) && expectedUid !== null &&
                (root.uid !== expectedUid || root.ppid !== process.pid || root.pgid !== parentPid)) {
                throw cleanupError('The CLI launch gate owner or process group could not be verified.');
            }
            if (root && !owned.has(parentPid) && !parentExited && child.exitCode == null && child.signalCode == null) owned.set(parentPid, root);
            let expanded = true;
            while (expanded) {
                expanded = false;
                for (const row of table.values()) {
                    if (owned.has(row.pid)) continue;
                    const parent = owned.get(row.ppid);
                    const anchor = [...owned.values()].find((item) =>
                        item.pgid === parentPid && sameProcess(item, table.get(item.pid)));
                    if ((parent && sameProcess(parent, table.get(parent.pid))) ||
                        (row.pgid === parentPid && anchor)) {
                        owned.set(row.pid, row);
                        expanded = true;
                    }
                }
            }
            return table;
        })();
        sampling = sample;
        sample.then(() => { sampling = null; }, (error) => {
            trackingFailure = error.message;
            sampling = null;
        });
        return sample;
    };
    const ready = (async () => {
        const deadline = now() + launchWaitMs;
        for (;;) {
            if (parentExited || closed || (launchGate && stopping)) return lastTable;
            const table = await observe();
            if (owned.has(parentPid) || !launchGate || parentExited || closed) return table;
            if (now() >= deadline) throw cleanupError('The CLI launch gate identity was not observed before the deadline.');
            await wait(Math.min(25, deadline - now()));
        }
    })();
    ready.catch(() => {});
    const monitor = setInterval(() => { observe().catch(() => {}); }, pollMs);
    monitor.unref?.();

    const stop = (graceMs = 2500) => {
        if (stopping) return stopping;
        stopping = (async () => {
            if (!parentPid) {
                await closedPromise;
                return;
            }
            await ready;
            if (!owned.has(parentPid)) {
                throw cleanupError('The CLI exited before its process identity could be verified.');
            }
            const deadline = now() + graceMs + 5000;
            let escalated = false;
            const signalOwned = async (signal) => {
                const table = await observe();
                if (trackingFailure) throw cleanupError('CLI process identity could not be verified.');
                // Check each captured identity again immediately before signaling it.
                for (const identity of [...owned.values()].reverse()) {
                    const current = (await readTable()).get(identity.pid);
                    if (!sameProcess(identity, current)) continue;
                    if (identity.uid !== undefined && current.uid !== identity.uid) {
                        unknownDescendant = true;
                        throw cleanupError('A CLI process owner changed. Cleanup needs manual recovery.');
                    }
                    try { signalPid(identity.pid, signal); }
                    catch (error) { if (error.code !== 'ESRCH') throw error; }
                }
                return table;
            };
            await signalOwned('SIGTERM');
            const forceAt = now() + graceMs;
            for (;;) {
                const table = await observe();
                if (trackingFailure) throw cleanupError('CLI process tracking was interrupted.');
                const alive = [...owned.values()].filter((row) => sameProcess(row, table.get(row.pid)));
                const unknownGroup = [...table.values()].some((row) =>
                    row.pgid === parentPid && !sameProcess(owned.get(row.pid), row));
                if (unknownGroup) {
                    unknownDescendant = true;
                    throw cleanupError('An unverified CLI descendant may still be running.');
                }
                if (!alive.length && parentExited && closed) return;
                if (!escalated && now() >= forceAt) {
                    escalated = true;
                    await signalOwned('SIGKILL');
                }
                if (now() >= deadline) throw cleanupError('CLI cleanup could not be confirmed.');
                await wait(50);
            }
        })().catch((error) => {
            const failure = error.code === 'cleanup_unconfirmed' ? error : cleanupError(error.message);
            const identities = new Map(owned);
            for (const row of lastTable.values()) {
                if (row.pgid === parentPid) identities.set(row.pid, row);
            }
            failure.identities = [...identities.values()].map(({ pid, start }) => ({ pid, start }));
            failure.unobserved = Boolean(trackingFailure || unknownDescendant || !owned.has(parentPid) || !closed);
            throw failure;
        }).finally(() => { clearInterval(monitor); });
        return stopping;
    };
    const readyForLaunch = async (uid) => {
        await ready;
        const deadline = now() + launchWaitMs;
        for (;;) {
            if (trackingFailure || stopping || parentExited || closed) {
                throw cleanupError('The CLI launch gate identity could not be verified.');
            }
            const table = await observe();
            if (trackingFailure || stopping || parentExited || closed) {
                throw cleanupError('The CLI launch gate identity could not be verified.');
            }
            const identity = owned.get(parentPid);
            const current = table.get(parentPid);
            if (current) {
                if (!sameProcess(identity, current) || current.uid !== uid ||
                    current.ppid !== process.pid || current.pgid !== parentPid) {
                    trackingFailure = 'The captured CLI launch gate identity changed.';
                    throw cleanupError('The CLI launch gate identity could not be verified.');
                }
                return identity;
            }
            if (!launchGate || now() >= deadline) {
                throw cleanupError('The CLI launch gate identity could not be verified.');
            }
            await wait(Math.min(25, deadline - now()));
        }
    };
    return { stop, readyForLaunch, isStopping: () => Boolean(stopping) };
}

// A fixed OS shell only waits on fd3, validates the native nonce, closes fd3,
// then replaces itself with the absolute CLI. User argv never becomes code.
const LAUNCH_GATE_SCRIPT = 'IFS= read -r gate <&3 || exit 125; [ "$gate" = "$1" ] || exit 125; shift; exec 3<&-; exec "$@"';

function gatedLaunch(binary, args, env, nonce) {
    if (typeof binary !== 'string' || !isAbsolute(binary) || binary.includes('\0') || !Array.isArray(args) || args.length > 256 ||
        args.some((arg) => typeof arg !== 'string' || arg.includes('\0') || arg.length > 65536) ||
        !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid CLI launch arguments.');
    const filtered = pickCliEnv(env);
    // Privileged shell mode ignores startup env/function imports. Keep these
    // stripped as defense in depth and never restore loader injections at exec.
    for (const key of Object.keys(filtered)) {
        if (/^(?:ENV|BASH_ENV|SHELLOPTS|BASHOPTS|NODE_OPTIONS)$/.test(key) ||
            /^(?:BASH_FUNC_|DYLD_|LD_)/.test(key) || key.includes('()')) delete filtered[key];
    }
    return { binary: '/bin/sh', args: ['-p', '-c', LAUNCH_GATE_SCRIPT, 'weblab-cli-gate', nonce, binary, ...args], env: filtered };
}

function spawnCli(binary, args, { cwd, env } = {}) {
    if (process.platform === 'win32' || typeof process.getuid !== 'function') {
        throw new Error('Safe CLI launch is not available on Windows yet.');
    }
    env = env ?? cliEnv();
    if (!isAbsolute(binary)) {
        if (binary.includes('/') || binary.includes('\\')) throw new Error('The CLI executable must be absolute.');
        binary = resolveOnPath(binary, env);
        if (!binary) throw new Error('The CLI executable could not be found.');
    }
    const nonce = randomBytes(32).toString('hex');
    const launch = gatedLaunch(binary, args, env, nonce);
    const child = spawn(launch.binary, launch.args, {
        cwd, env: launch.env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], shell: false,
        detached: true, windowsHide: true,
    });
    const lifecycle = createChildLifecycle(child, { expectedUid: process.getuid(), launchGate: true });
    lifecycles.set(child, lifecycle);
    const gate = child.stdio[3];
    gate?.on('error', () => {}); // The cleanup path reports launch/exit failure.
    void lifecycle.readyForLaunch(process.getuid()).then(() => {
        if (lifecycle.isStopping()) { gate?.destroy(); return; }
        // Exactly one bounded native frame; no renderer or prompt bytes reach fd3.
        gate.end(nonce + '\n');
    }).catch((error) => {
        gate?.destroy(); // EOF never executes the target.
        if (lifecycle.isStopping() || !child.pid) return;
        child.emit('error', error);
    });
    return child;
}

/** Resolves only after captured descendants, parent and output have closed. */
function killTree(child, graceMs = 2500) {
    if (!child) return Promise.resolve();
    const lifecycle = lifecycles.get(child);
    if (!lifecycle) return Promise.reject(cleanupError('CLI process ownership is unknown.'));
    return lifecycle.stop(graceMs);
}

/** Bounded, cancellable probes. Failed cleanup propagates to folder quarantine. */
function runCapture(binary, args, {
    env, timeoutMs = 8000, cwd, signal, maxBytes = 1024 * 1024, input = '',
    spawnChild = spawnCli, stopChild = killTree,
} = {}) {
    if (signal?.aborted) return Promise.resolve({ code: null, stdout: '', stderr: '', aborted: true });
    return new Promise((resolve, reject) => {
        let child;
        try { child = spawnChild(binary, args, { env, cwd }); }
        catch (error) { resolve({ code: null, stdout: '', stderr: '', error: error.message }); return; }
        let stdout = '';
        let stderr = '';
        let bytes = 0;
        let settled = false;
        let finishing = false;
        let timedOut = false;
        let aborted = false;
        let truncated = false;
        let timer;
        const finish = async (code, error) => {
            if (finishing) return;
            finishing = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            try {
                await stopChild(child, 500);
                settled = true;
                resolve({ code, stdout, stderr, timedOut, aborted, truncated, ...(error ? { error } : {}) });
            } catch (cause) { reject(cause); }
        };
        const onAbort = () => { aborted = true; void finish(null); };
        const append = (target, chunk) => {
            if (settled || finishing) return;
            bytes += chunk.length;
            if (bytes > maxBytes) { truncated = true; void finish(null); return; }
            if (target === 'stdout') stdout += chunk.toString();
            else stderr += chunk.toString();
        };
        child.stdout.on('data', (chunk) => append('stdout', chunk));
        child.stderr.on('data', (chunk) => append('stderr', chunk));
        child.stdin.on('error', () => {});
        child.on('error', (error) => { void finish(null, error.message); });
        child.on('close', (code) => { void finish(code); });
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { timedOut = true; void finish(null); }, timeoutMs);
        if (signal?.aborted) onAbort();
        else child.stdin.end(input);
    });
}

module.exports = {
    pickCliEnv, cliEnv, resolveOnPath, spawnCli, killTree, runCapture,
    createChildLifecycle, cleanupError,
    gatedLaunch, LAUNCH_GATE_SCRIPT,
};
