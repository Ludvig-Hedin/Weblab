/**
 * Bridge between the renderer (Weblab web app loaded inside the BrowserWindow)
 * and CLI-based AI providers (Codex, Claude Code, Gemini, OpenCode, Cursor,
 * Ollama) running on the user's machine.
 *
 * Two responsibilities:
 *   1. `weblab-cli:provider-status` — probe each provider's binary
 *      (`--version`, then its own sign-in status command) so the picker can
 *      show Ready/Install/Sign-in.
 *   2. `weblab-cli:start` / `weblab-cli:abort` — spawn the right CLI for a chat
 *      turn and stream events back to the renderer as AI SDK v6
 *      `UIMessageStreamPart` payloads.
 *
 * Origin gate: every handler verifies the senderFrame's URL origin and rejects
 * if it doesn't match `allowedOrigins`. Without this, an attacker who tricked
 * the BrowserWindow into navigating to a hostile origin could call IPC.
 */

const { ipcMain } = require('electron');
const { isTrustedSender } = require('./auth-policy');
const { registerStreamingHandlers, disposeStreams } = require('./cli/main-bridge');
const { claudeIsolationStatus } = require('./cli/claude');
const { cliEnv, resolveOnPath, runCapture } = require('./cli/process');
const { parseClaudeAuthStatus, parseCodexLoginStatus } = require('./cli/status');

const PROVIDERS = {
    codex: { binary: 'codex', authArgs: ['login', 'status'], parseAuth: parseCodexLoginStatus },
    'claude-code': { binary: 'claude', authArgs: ['auth', 'status'], parseAuth: parseClaudeAuthStatus },
    gemini: { binary: 'gemini' },
    opencode: { binary: 'opencode' },
    cursor: { binary: 'cursor-agent' },
    ollama: { binary: 'ollama' },
};

const VERSION_TIMEOUT_MS = 8000;
const AUTH_TIMEOUT_MS = 8000;

/**
 * Probe one provider with the user's login-shell PATH (a Finder-launched app
 * otherwise misses Homebrew / npm-global binaries).
 *   installed: binary found and `--version` exits 0
 *   authStatus: 'ready' | 'sign-in' | 'unknown' from the CLI's own status
 *               command; providers without one report 'ready'.
 */
async function probeProvider({ binary, authArgs, parseAuth }, env) {
    const binaryPath = resolveOnPath(binary, env);
    if (!binaryPath) return { installed: false, authStatus: 'sign-in' };
    const version = await runCapture(binaryPath, ['--version'], { env, timeoutMs: VERSION_TIMEOUT_MS });
    if (version.code !== 0) return { installed: false, authStatus: 'sign-in' };
    const versionLine = version.stdout.trim().split('\n')[0] || undefined;
    if (!authArgs) return { installed: true, authStatus: 'ready', version: versionLine };
    const auth = await runCapture(binaryPath, authArgs, { env, timeoutMs: AUTH_TIMEOUT_MS });
    return {
        installed: true,
        authStatus: auth.timedOut || auth.error ? 'unknown' : parseAuth(auth),
        version: versionLine,
    };
}

/**
 * @returns {Record<string, { installed: boolean; authStatus: 'ready' | 'sign-in' | 'unknown'; version?: string }>}
 */
async function getProviderStatuses() {
    const env = cliEnv();
    const results = {};
    await Promise.all(
        Object.entries(PROVIDERS).map(async ([kind, provider]) => {
            if (kind === 'claude-code' && !claudeIsolationStatus().available) {
                results[kind] = { installed: false, authStatus: 'unknown', blockedCode: 'isolation-unverified' };
                return;
            }
            try { results[kind] = await probeProvider(provider, env); }
            catch { results[kind] = { installed: false, authStatus: 'unknown' }; }
        }),
    );
    return results;
}

function registerIpcHandlers({ allowedOrigins, getWebContents }) {
    ipcMain.handle('weblab-cli:provider-status', async (event) => {
        if (!isTrustedSender(event, getWebContents(), allowedOrigins)) return null;
        return getProviderStatuses();
    });

    ipcMain.handle('weblab-cli:ollama-pull', async (event, payload) => {
        if (!isTrustedSender(event, getWebContents(), allowedOrigins)) {
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
        return { ok: false, error: 'Manage Ollama models in Ollama until safe process ownership is available.' };
    });

    ipcMain.handle('weblab-cli:ollama-quit', async (event) => {
        if (!isTrustedSender(event, getWebContents(), allowedOrigins)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        return { ok: false, error: 'Quit Ollama in Ollama. Weblab cannot safely stop a process it did not start.' };
    });

    registerStreamingHandlers({ ipcMain, allowedOrigins, getWebContents });
}

/** Stop CLI chat turns and wait (≤5s) for their journaling to finish. */
function disposeCli() {
    return disposeStreams(5000);
}

module.exports = { registerIpcHandlers, getProviderStatuses, disposeCli };
