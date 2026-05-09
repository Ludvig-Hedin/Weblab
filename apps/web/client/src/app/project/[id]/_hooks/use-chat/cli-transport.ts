'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { inferProviderFromModelId } from '@weblab/ai/client';

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
    constructor(private readonly getModel?: () => string | undefined) {}

    async sendMessages(
        options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
    ): Promise<ReadableStream<UIMessageChunk>> {
        const bridge = getBridge();
        if (!bridge) throw new Error('CLI bridge not available — desktop runtime required');

        const streamId = uuidv4();
        const callBodyModel = (options.body as { model?: string } | undefined)?.model;
        const model = callBodyModel ?? this.getModel?.();
        if (!model) throw new Error('Missing model in chat request body');
        const provider = inferProviderFromModelId(model);

        const cliMessages = options.messages.map((m) => ({
            role: m.role,
            content: flattenContent(m),
        }));

        let unsubscribe: (() => void) | null = null;
        // Single-fire terminal guard. Adapters can emit duplicate terminal
        // events (spawn 'error' then readline 'close' → both fire). Without
        // this, calling controller.error()/close() after termination throws
        // "Cannot perform action while not in readable state" and the IPC
        // listener throws uncaught into the renderer.
        let terminated = false;
        const cleanup = () => {
            const fn = unsubscribe;
            unsubscribe = null;
            fn?.();
        };
        const terminate = (apply: () => void) => {
            if (terminated) return;
            terminated = true;
            try {
                apply();
            } catch {
                // controller already closed/errored elsewhere
            }
            cleanup();
        };

        const stream = new ReadableStream<UIMessageChunk>({
            start(controller) {
                unsubscribe = bridge.onEvent((event) => {
                    if (event.streamId !== streamId) return;
                    if (event.kind === 'part') {
                        if (terminated) return;
                        try {
                            controller.enqueue(event.payload);
                        } catch {
                            // stream may have closed mid-flight
                        }
                    } else if (event.kind === 'error') {
                        terminate(() => controller.error(new Error(event.payload.message)));
                    } else if (event.kind === 'finish') {
                        terminate(() => controller.close());
                    }
                });

                options.abortSignal?.addEventListener(
                    'abort',
                    () => {
                        bridge.abort(streamId);
                        terminate(() => controller.close());
                    },
                    { once: true },
                );

                void bridge
                    .startStream({ streamId, provider, model, messages: cliMessages })
                    .then((result) => {
                        if (!result.ok) {
                            terminate(() =>
                                controller.error(
                                    new Error(result.error ?? 'cli bridge refused stream'),
                                ),
                            );
                        }
                    })
                    .catch((cause: unknown) => {
                        terminate(() =>
                            controller.error(
                                cause instanceof Error ? cause : new Error(String(cause)),
                            ),
                        );
                    });
            },
            cancel() {
                bridge.abort(streamId);
                terminate(() => undefined);
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
