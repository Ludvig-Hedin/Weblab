'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { inferProviderFromModelId } from '@weblab/ai';

/**
 * Bridge from Vercel AI SDK's ChatTransport contract to the Electron main
 * process IPC channels exposed by `apps/desktop/cli/main-bridge.js`. The main
 * process spawns the right CLI per provider and emits AI SDK v6
 * UIMessageStreamPart payloads via `weblab-cli:event`. We splice those
 * straight into the SDK by yielding them as-is from the ReadableStream.
 *
 * Only used when `window.weblabNative.cli` is present (desktop runtime). On
 * hosted web the RoutingTransport falls back to DefaultChatTransport pointing
 * at `/api/chat`.
 */

type CliEvent =
    | { streamId: string; kind: 'part'; payload: UIMessageChunk }
    | { streamId: string; kind: 'error'; payload: { message: string; code?: string } }
    | { streamId: string; kind: 'finish' };

type CliBridge = {
    startStream: (req: {
        streamId: string;
        provider: string;
        model: string;
        messages: ReadonlyArray<{ role: string; content: string }>;
        workingDirectory?: string;
    }) => Promise<{ ok: boolean; error?: string }>;
    abort: (streamId: string) => void;
    onEvent: (listener: (event: CliEvent) => void) => () => void;
};

function getBridge(): CliBridge | null {
    if (typeof window === 'undefined') return null;
    const native = window.weblabNative as { cli?: CliBridge } | undefined;
    return native?.cli ?? null;
}

/** True when the desktop bridge is available. */
export function hasCliBridge(): boolean {
    return getBridge() !== null;
}

/** True when this model+provider combination should be routed through the CLI bridge. */
export function shouldUseCliBridge(model: string): boolean {
    if (!hasCliBridge()) return false;
    const provider = inferProviderFromModelId(model);
    return provider !== 'openrouter' && provider !== 'ollama';
}

function flattenContent(message: UIMessage): string {
    const parts = message.parts ?? [];
    return parts
        .filter((p): p is Extract<typeof p, { type: 'text'; text: string }> => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
}

export class WeblabCliTransport implements ChatTransport<UIMessage> {
    async sendMessages(
        options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
    ): Promise<ReadableStream<UIMessageChunk>> {
        const bridge = getBridge();
        if (!bridge) throw new Error('CLI bridge not available — desktop runtime required');

        const streamId = uuidv4();
        const model = (options.body as { model?: string } | undefined)?.model;
        if (!model) throw new Error('Missing model in chat request body');
        const provider = inferProviderFromModelId(model);

        const cliMessages = options.messages.map((m) => ({
            role: m.role,
            content: flattenContent(m),
        }));

        let unsubscribe: (() => void) | null = null;

        const stream = new ReadableStream<UIMessageChunk>({
            start(controller) {
                unsubscribe = bridge.onEvent((event) => {
                    if (event.streamId !== streamId) return;
                    if (event.kind === 'part') {
                        controller.enqueue(event.payload);
                    } else if (event.kind === 'error') {
                        controller.error(new Error(event.payload.message));
                    } else if (event.kind === 'finish') {
                        controller.close();
                    }
                });

                options.abortSignal?.addEventListener(
                    'abort',
                    () => {
                        bridge.abort(streamId);
                        try {
                            controller.close();
                        } catch {
                            // already closed
                        }
                    },
                    { once: true },
                );

                void bridge
                    .startStream({ streamId, provider, model, messages: cliMessages })
                    .then((result) => {
                        if (!result.ok) {
                            controller.error(
                                new Error(result.error ?? 'cli bridge refused stream'),
                            );
                        }
                    })
                    .catch((cause: unknown) => {
                        controller.error(cause instanceof Error ? cause : new Error(String(cause)));
                    });
            },
            cancel() {
                bridge.abort(streamId);
                unsubscribe?.();
            },
        });

        return stream;
    }

    async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
        // CLI streams are ephemeral — no resume support yet. Returning null tells
        // useChat to start a fresh request on reconnect, which matches the
        // behavior users get on hosted web today.
        return null;
    }
}
