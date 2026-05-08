/**
 * Streaming dispatcher: wires the renderer's `weblab-cli:start` / `:abort`
 * IPC channels into per-provider adapters and forwards their CliEvent
 * payloads back via `webContents.send('weblab-cli:event', …)`.
 *
 * Origin gate: every handler verifies the senderFrame's origin matches the
 * canonical APP_ORIGIN. Outside requests get rejected before any spawn.
 */

const claudeAdapter = require('./claude');
const stubs = require('./stubs');

const ADAPTERS = {
    'claude-code': claudeAdapter,
    codex: stubs.codex,
    gemini: stubs.gemini,
    opencode: stubs.opencode,
    cursor: stubs.cursor,
    ollama: stubs.ollama,
};

function isFromAppOrigin(event, appOrigin) {
    try {
        const senderUrl =
            (event.senderFrame && event.senderFrame.url) ||
            (event.sender && event.sender.getURL && event.sender.getURL());
        if (!senderUrl) return false;
        return new URL(senderUrl).origin === appOrigin;
    } catch {
        return false;
    }
}

function registerStreamingHandlers({ ipcMain, appOrigin, getWebContents }) {
    const active = new Map();

    const emit = (cliEvent) => {
        const wc = getWebContents();
        if (!wc) return;
        try {
            wc.send('weblab-cli:event', cliEvent);
        } catch {
            // window may have closed mid-stream
        }
    };

    ipcMain.handle('weblab-cli:start', async (event, request) => {
        if (!isFromAppOrigin(event, appOrigin)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        if (!request || !request.streamId || !request.provider) {
            return { ok: false, error: 'invalid_request' };
        }
        if (request.provider === 'openrouter') {
            return { ok: false, error: 'unsupported_provider' };
        }

        const adapter = ADAPTERS[request.provider];
        if (!adapter) return { ok: false, error: 'unknown_provider' };

        const ac = new AbortController();
        active.set(request.streamId, { abort: ac });

        adapter
            .startStream({ request, emit, signal: ac.signal })
            .catch((cause) => {
                emit({
                    streamId: request.streamId,
                    kind: 'error',
                    payload: {
                        message: cause instanceof Error ? cause.message : String(cause),
                        code: 'adapter_error',
                    },
                });
            })
            .finally(() => {
                active.delete(request.streamId);
            });

        return { ok: true };
    });

    ipcMain.on('weblab-cli:abort', (event, arg) => {
        if (!isFromAppOrigin(event, appOrigin)) return;
        const streamId = arg && arg.streamId;
        if (!streamId) return;
        const entry = active.get(streamId);
        if (!entry) return;
        entry.abort.abort();
        active.delete(streamId);
    });
}

module.exports = { registerStreamingHandlers };
