/**
 * Streaming dispatcher: wires the renderer's `weblab-cli:start` / `:abort`
 * IPC channels into per-provider adapters and forwards their CliEvent
 * payloads back via `webContents.send('weblab-cli:event', …)`.
 *
 * Guards, in order, before anything is spawned:
 *   1. Sender gate: the main window's own webContents, its main frame, and one
 *      of our origins (same rule as weblab-local's IPC).
 *   2. Working directory: must be a granted Weblab private working copy
 *      (weblab-local's requirePrivateWorkingRoot). The renderer can never make
 *      a CLI run in an arbitrary folder, and never in the user's original repo.
 *   3. One running turn per folder.
 *
 * After each turn, only the files the CLI itself reported editing are
 * journaled so the private copy's Git handoff includes them.
 */

const claudeAdapter = require('./claude');
const codexAdapter = require('./codex');
const stubs = require('./stubs');
const { createTurnRegistry } = require('./turns');

const ADAPTERS = {
    'claude-code': claudeAdapter,
    codex: codexAdapter,
    gemini: stubs.gemini,
    opencode: stubs.opencode,
    cursor: stubs.cursor,
    ollama: stubs.ollama,
};

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

/** The main window's top frame on one of our origins — nothing else. */
function isTrustedSender(event, allowedOrigins, getWebContents) {
    try {
        return event.sender === getWebContents() &&
            event.senderFrame === event.sender.mainFrame &&
            isFromAllowedOrigin(event, allowedOrigins);
    } catch {
        return false;
    }
}

function localApi() {
    // Lazy so this module stays loadable without Electron in unit tests.
    return require('../weblab-local');
}

async function resolveWorkingDirectory(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new Error('missing_working_directory');
    }
    return localApi().requirePrivateWorkingRoot(dir);
}

const turns = createTurnRegistry();

/** Abort every running CLI turn and wait (≤ timeoutMs) for cleanup (app quit). */
function disposeStreams(timeoutMs = 5000) {
    return turns.abortAll(timeoutMs);
}

function isTerminalPart(event) {
    const type = event?.kind === 'part' ? event.payload?.type : null;
    return type === 'finish' || type === 'error';
}

function registerStreamingHandlers({ ipcMain, allowedOrigins, getWebContents }) {
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
        if (!isTrustedSender(event, allowedOrigins, getWebContents)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        if (!request || typeof request.streamId !== 'string' || !request.provider) {
            return { ok: false, error: 'invalid_request' };
        }
        if (request.provider === 'openrouter') {
            return { ok: false, error: 'unsupported_provider' };
        }
        const adapter = ADAPTERS[request.provider];
        if (!adapter) return { ok: false, error: 'unknown_provider' };

        let cwd;
        try {
            cwd = await resolveWorkingDirectory(request.workingDirectory);
        } catch {
            return {
                ok: false,
                error: 'Open a local folder to use a CLI model. This project has no local working copy.',
            };
        }
        const busy = turns.acquire(request.streamId, cwd);
        if (busy) return { ok: false, error: busy };
        const { streamId } = request;
        const signal = turns.signal(streamId);

        // Hold the closing events until the edits are journaled, so the
        // handoff never sees a half-recorded turn and a handoff note can
        // still be shown inside this reply.
        const held = [];
        const turnEmit = (cliEvent) => {
            if (cliEvent && (cliEvent.kind === 'finish' || cliEvent.kind === 'error' || isTerminalPart(cliEvent))) {
                held.push(cliEvent);
                return;
            }
            emit(cliEvent);
        };

        void (async () => {
            let cleanupFailed = false;
            try {
                await localApi().withCliTurn(cwd, async () => {
                    const result = await adapter.startStream({
                        request: { ...request, workingDirectory: cwd },
                        emit: turnEmit,
                        signal,
                    });
                    const touched = Array.isArray(result?.touchedPaths) ? result.touchedPaths : [];
                    if (!touched.length) return;
                    const { skipped } = await localApi().journalCliEdits(cwd, touched);
                    if (skipped.length > 0) {
                        emit({
                            streamId,
                            kind: 'part',
                            payload: {
                                type: 'data-cli-tool',
                                id: `handoff-note-${streamId}`,
                                data: {
                                    provider: request.provider,
                                    tool: 'handoff_note',
                                    input: { files: skipped.map((item) => item.path) },
                                    status: 'error',
                                    errorText: `Weblab could not record ${skipped.length === 1 ? 'this file' : 'these files'} for the Git handoff: ${skipped.map((item) => item.path).join(', ')}. The handoff will list ${skipped.length === 1 ? 'it' : 'them'} as unsupported changes.`,
                                },
                            },
                        });
                        throw new Error('AI edits could not be fully recorded. This copy needs recovery before editing.');
                    }
                });
            } catch (cause) {
                cleanupFailed = true;
                turns.quarantine(streamId);
                // withCliTurn keeps durable ownership on every failure,
                // including failed persistence and incomplete journaling.
                const message = cause instanceof Error ? cause.message : String(cause);
                held.length = 0;
                turnEmit({ streamId, kind: 'part', payload: { type: 'error', errorText: message } });
                turnEmit({ streamId, kind: 'error', payload: { message, code: 'adapter_error' } });
            }
            if (!cleanupFailed) turns.release(streamId);
            const terminal = held.filter((e) => e.kind === 'finish' || e.kind === 'error');
            for (const e of held) if (e.kind === 'part') emit(e);
            emit(terminal[0] ?? { streamId, kind: 'finish' });
        })();

        return { ok: true };
    });

    ipcMain.on('weblab-cli:abort', (event, arg) => {
        if (!isTrustedSender(event, allowedOrigins, getWebContents)) return;
        const streamId = arg && arg.streamId;
        if (!streamId) return;
        // The turn's own cleanup releases the folder after the child is gone.
        turns.abort(streamId);
    });
}

module.exports = { registerStreamingHandlers, disposeStreams, resolveWorkingDirectory };
