/**
 * Bridge between the renderer (Weblab web app loaded inside the BrowserWindow)
 * and CLI-based AI providers (Codex, Claude Code, Gemini, OpenCode, Cursor,
 * Ollama) running on the user's machine.
 *
 * Two responsibilities:
 *   1. `weblab-cli:provider-status` — probe each provider's binary with a
 *      short `--version` invocation so the picker can show Ready/Install/Sign-in.
 *   2. `weblab-cli:start` / `weblab-cli:abort` — spawn the right CLI for a chat
 *      turn and stream events back to the renderer as AI SDK v6
 *      `UIMessageStreamPart` payloads.
 *
 * Origin gate: every handler verifies the senderFrame's URL origin and rejects
 * if it doesn't match `allowedOrigins`. Without this, an attacker who tricked
 * the BrowserWindow into navigating to a hostile origin could call IPC.
 */

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const { registerStreamingHandlers } = require('./cli/main-bridge');

const PROVIDERS = {
    codex: { binary: 'codex' },
    'claude-code': { binary: 'claude' },
    gemini: { binary: 'gemini' },
    opencode: { binary: 'opencode' },
    cursor: { binary: 'cursor-agent' },
    ollama: { binary: 'ollama' },
};

const VERSION_TIMEOUT_MS = 3000;

// Reject leading `-` so a malicious model name can't masquerade as an Ollama
// flag (`--help`, `-y`). Allow alnum, dot, colon, slash, dash, underscore.
const SAFE_OLLAMA_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;

function probeBinary(binary) {
    return new Promise((resolve) => {
        let settled = false;
        let timeoutHandle = null;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            resolve(value);
        };
        let child;
        try {
            child = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch {
            return finish({ installed: false });
        }
        let stdout = '';
        child.stdout.on('data', (b) => {
            stdout += b.toString();
        });
        child.on('error', () => finish({ installed: false }));
        child.on('exit', (code) => {
            if (code === 0) {
                finish({ installed: true, version: stdout.trim().split('\n')[0] });
            } else {
                finish({ installed: false });
            }
        });
        timeoutHandle = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                // ignore
            }
            finish({ installed: false });
        }, VERSION_TIMEOUT_MS);
    });
}

/**
 * @returns {Record<string, { installed: boolean; authStatus: 'ready' | 'sign-in'; version?: string }>}
 */
async function getProviderStatuses() {
    const results = {};
    await Promise.all(
        Object.entries(PROVIDERS).map(async ([kind, { binary }]) => {
            const probe = await probeBinary(binary);
            results[kind] = probe.installed
                ? { installed: true, authStatus: 'ready', version: probe.version }
                : { installed: false, authStatus: 'sign-in' };
        }),
    );
    return results;
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

/**
 * Stream `ollama pull <model>` progress to the renderer. modelName is
 * validated against SAFE_OLLAMA_MODEL before reaching argv to block flag
 * injection. shell:false (default) on spawn — argv is never re-parsed.
 */
async function pullOllamaModel(pullId, modelName, getWebContents) {
    return new Promise((resolve) => {
        if (!SAFE_OLLAMA_MODEL.test(modelName)) {
            return resolve({ ok: false, error: 'invalid_model_name' });
        }
        let child;
        try {
            // `--` end-of-options sentinel: belt-and-braces in case ollama
            // ever changes its parser to accept flags after positionals.
            child = spawn('ollama', ['pull', '--', modelName], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch (cause) {
            return resolve({ ok: false, error: cause.message });
        }

        const sendProgress = (line) => {
            const wc = getWebContents();
            if (!wc) return;
            try {
                wc.send('weblab-cli:ollama-pull-progress', { pullId, line });
            } catch {
                // window may have closed mid-pull
            }
        };

        let stderrTail = '';
        let stderrAll = '';
        const handleChunk = (chunk) => {
            stderrAll += chunk;
            stderrTail += chunk;
            const parts = stderrTail.split(/\r\n|\r|\n/);
            stderrTail = parts.pop() ?? '';
            for (const line of parts) {
                if (line.trim().length > 0) sendProgress(line.trim());
            }
        };
        // Some ollama versions write progress to stdout, others to stderr.
        // Listen on both so we don't miss updates.
        child.stdout.on('data', (b) => handleChunk(b.toString()));
        child.stderr.on('data', (b) => handleChunk(b.toString()));

        child.on('error', (cause) => resolve({ ok: false, error: cause.message }));
        child.on('exit', (code) => {
            if (stderrTail.trim().length > 0) sendProgress(stderrTail.trim());
            if (code === 0) resolve({ ok: true });
            else resolve({ ok: false, error: stderrAll.trim() || `ollama pull exited with ${code}` });
        });
    });
}

/**
 * Stop the local Ollama server. No first-class CLI command across platforms —
 * `ollama stop <model>` only unloads a single model, never the server.
 *
 *   - macOS / Linux: `pkill -x ollama` (exact process name; `-f` was too
 *     greedy and would match shells with `OLLAMA_HOST` exported).
 *   - Windows:       `taskkill /F /IM ollama.exe /T` (`/T` kills child
 *     inference servers like ollama_llama_server.exe).
 */
async function quitOllama() {
    return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? 'taskkill' : 'pkill';
        const args = isWindows
            ? ['/F', '/IM', 'ollama.exe', '/T']
            : ['-x', 'ollama'];
        let child;
        try {
            child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch {
            return resolve({
                ok: false,
                error: 'Could not invoke process killer — quit Ollama manually.',
            });
        }
        let stderr = '';
        if (child.stderr) {
            child.stderr.on('data', (b) => {
                stderr += b.toString();
            });
        }
        child.on('exit', (code) => {
            // pkill exits 0 on match, 1 on no-match. taskkill exits 0 on
            // success, 128 if no process. Treat "no process" as success.
            if (code === 0 || code === 1 || code === 128) {
                resolve({ ok: true });
            } else {
                resolve({
                    ok: false,
                    error: stderr.trim() || `${cmd} exited with code ${code}`,
                });
            }
        });
        child.on('error', () => {
            resolve({
                ok: false,
                error: `${cmd} not available on this system — quit Ollama manually.`,
            });
        });
    });
}

function registerIpcHandlers({ allowedOrigins, getWebContents }) {
    ipcMain.handle('weblab-cli:provider-status', async (event) => {
        if (!isFromAllowedOrigin(event, allowedOrigins)) return null;
        return getProviderStatuses();
    });

    ipcMain.handle('weblab-cli:ollama-pull', async (event, payload) => {
        if (!isFromAllowedOrigin(event, allowedOrigins)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        const modelName = (payload && payload.model) || '';
        const pullId = (payload && payload.pullId) || '';
        if (typeof modelName !== 'string' || modelName.length === 0) {
            return { ok: false, error: 'invalid_model_name' };
        }
        if (typeof pullId !== 'string' || pullId.length === 0) {
            return { ok: false, error: 'invalid_pull_id' };
        }
        return pullOllamaModel(pullId, modelName, getWebContents);
    });

    ipcMain.handle('weblab-cli:ollama-quit', async (event) => {
        if (!isFromAllowedOrigin(event, allowedOrigins)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        return quitOllama();
    });

    registerStreamingHandlers({ ipcMain, allowedOrigins, getWebContents });
}

module.exports = { registerIpcHandlers, getProviderStatuses };
