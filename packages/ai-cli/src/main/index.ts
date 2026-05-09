import type {
    CliAdapter,
    CliEvent,
    CliEventEmitter,
    CliStreamRequest,
    ProviderKind,
} from '../types';
import { createClaudeAdapter } from '../claude';
import {
    createCodexAdapter,
    createCursorAdapter,
    createGeminiAdapter,
    createOllamaAdapter,
    createOpenCodeAdapter,
} from '../stubs';

/**
 * Minimal Electron `IpcMain` shape this bridge depends on. We don't import
 * `electron` directly so this package can be unit-tested without the runtime.
 */
type IpcLike = {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
};

type WebContentsLike = {
    send(channel: string, ...args: unknown[]): void;
};

type IpcEventLike = {
    senderFrame?: { url: string };
    sender: { getURL(): string };
};

export type MainBridgeOptions = {
    appOrigin: string;
    /** Returns the BrowserWindow's webContents to push events to. */
    getWebContents: () => WebContentsLike | null;
};

const ADAPTERS: Record<ProviderKind, () => CliAdapter> = {
    openrouter: () => {
        throw new Error('openrouter is not a CLI provider');
    },
    ollama: createOllamaAdapter,
    codex: createCodexAdapter,
    'claude-code': createClaudeAdapter,
    gemini: createGeminiAdapter,
    opencode: createOpenCodeAdapter,
    cursor: createCursorAdapter,
};

function isFromAppOrigin(event: IpcEventLike, appOrigin: string): boolean {
    try {
        const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
        return new URL(senderUrl).origin === appOrigin;
    } catch {
        return false;
    }
}

/**
 * Per-stream bookkeeping so `weblab-cli:abort` can find the matching
 * AbortController. Cleared when the adapter resolves.
 */
type ActiveStream = { abort: AbortController };

export function registerMainBridge(ipcMain: IpcLike, options: MainBridgeOptions): void {
    const active = new Map<string, ActiveStream>();

    const emit: (event: CliEvent) => void = (event) => {
        const wc = options.getWebContents();
        if (!wc) return;
        wc.send('weblab-cli:event', event);
    };

    ipcMain.handle('weblab-cli:start', async (event, ...args: unknown[]) => {
        if (!isFromAppOrigin(event as IpcEventLike, options.appOrigin)) {
            return { ok: false, error: 'origin_mismatch' };
        }
        const request = args[0] as CliStreamRequest | undefined;
        if (!request?.streamId || !request.provider) {
            return { ok: false, error: 'invalid_request' };
        }
        if (request.provider === 'openrouter') {
            return { ok: false, error: 'unsupported_provider' };
        }

        const factory = ADAPTERS[request.provider];
        if (!factory) return { ok: false, error: 'unknown_provider' };

        const adapter = factory();
        const ac = new AbortController();
        active.set(request.streamId, { abort: ac });

        const wrappedEmit: CliEventEmitter = (e) => emit(e);

        // Run the adapter without awaiting — it streams via emit() and we
        // signal completion through a synthetic finish event when it resolves.
        void adapter
            .startStream({ request, emit: wrappedEmit, signal: ac.signal })
            .catch((cause: unknown) => {
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

    ipcMain.on('weblab-cli:abort', (event, ...args: unknown[]) => {
        if (!isFromAppOrigin(event as IpcEventLike, options.appOrigin)) return;
        const arg = args[0] as { streamId?: string } | undefined;
        if (!arg?.streamId) return;
        const entry = active.get(arg.streamId);
        if (!entry) return;
        entry.abort.abort();
        active.delete(arg.streamId);
    });
}
