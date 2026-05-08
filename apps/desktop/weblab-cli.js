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
 *      `UIMessageStreamPart` payloads. The per-provider parsing lives in
 *      `@weblab/ai-cli` (see Step 3) — this module is the thin transport.
 *
 * Origin gate: every handler checks the senderFrame's URL origin and rejects
 * if it doesn't match APP_ORIGIN. Without this, an attacker who tricked the
 * BrowserWindow into navigating to a hostile origin could call IPC.
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

function probeBinary(binary) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
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
        setTimeout(() => {
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
 *
 * Auth detection is intentionally coarse for now: presence of the binary →
 * authStatus 'ready'. Step 3 swaps in real per-provider auth probes
 * (`codex app-server` handshake, `claude auth status`, etc.).
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

function isFromAppOrigin(event, appOrigin) {
    try {
        const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
        return new URL(senderUrl).origin === appOrigin;
    } catch {
        return false;
    }
}

async function pullOllamaModel(modelName) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn('ollama', ['pull', modelName], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch (cause) {
            return resolve({ ok: false, error: cause.message });
        }
        let stderr = '';
        child.stderr.on('data', (b) => {
            stderr += b.toString();
        });
        child.on('error', (cause) => resolve({ ok: false, error: cause.message }));
        child.on('exit', (code) => {
            if (code === 0) resolve({ ok: true });
            else resolve({ ok: false, error: stderr.trim() || `ollama pull exited with ${code}` });
        });
    });
}

async function quitOllama() {
    return new Promise((resolve) => {
        let child;
        try {
            // `ollama stop --all` would be ideal but the supported way to stop
            // the server itself is platform-dependent. We try `ollama stop`
            // first; on macOS/Linux a SIGTERM to all named processes is the
            // usual fallback. Best-effort.
            child = spawn('ollama', ['stop'], { stdio: 'ignore' });
        } catch {
            return resolve({ ok: false, error: 'failed_to_invoke_ollama' });
        }
        child.on('exit', (code) => resolve({ ok: code === 0 }));
        child.on('error', () => resolve({ ok: false, error: 'failed_to_invoke_ollama' }));
    });
}

function registerIpcHandlers({ appOrigin, getWebContents }) {
    ipcMain.handle('weblab-cli:provider-status', async (event) => {
        if (!isFromAppOrigin(event, appOrigin)) return null;
        return getProviderStatuses();
    });

    ipcMain.handle('weblab-cli:ollama-pull', async (event, payload) => {
        if (!isFromAppOrigin(event, appOrigin)) return { ok: false, error: 'origin_mismatch' };
        const modelName = (payload && payload.model) || '';
        if (typeof modelName !== 'string' || modelName.length === 0) {
            return { ok: false, error: 'invalid_model_name' };
        }
        return pullOllamaModel(modelName);
    });

    ipcMain.handle('weblab-cli:ollama-quit', async (event) => {
        if (!isFromAppOrigin(event, appOrigin)) return { ok: false, error: 'origin_mismatch' };
        return quitOllama();
    });

    // Streaming handlers (start/abort) are dispatched to per-provider adapters
    // in apps/desktop/cli/. Adapters emit AI SDK v6 UIMessageStreamPart
    // payloads which are forwarded to the renderer via
    // webContents.send('weblab-cli:event', …).
    registerStreamingHandlers({ ipcMain, appOrigin, getWebContents });
}

module.exports = { registerIpcHandlers, getProviderStatuses };
