'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { getProviderManifest, inferProviderFromModelId } from '@weblab/ai/client';

import { canResumeCliSession, loadCliSession, saveCliSession } from '@/lib/cli-chat/session';
import { startupDiagnosisBranch } from '@/lib/local-startup-recovery';

/**
 * Bridge from Vercel AI SDK's ChatTransport contract to the Electron main
 * process IPC channels exposed by `apps/desktop/cli/main-bridge.js`. The main
 * process runs the user's own CLI (Claude Code, Codex) inside the project's
 * private working copy and emits AI SDK UIMessageStreamPart payloads via
 * `weblab-cli:event`. We splice those straight into the SDK.
 *
 * Only used when `window.weblabNative.cli` is present (desktop runtime). On
 * hosted web the RoutingTransport falls back to DefaultChatTransport pointing
 * at `/api/chat`.
 */

type CliEvent =
    | { streamId: string; kind: 'part'; payload: UIMessageChunk }
    | {
          streamId: string;
          kind: 'error';
          payload: { message: string; code?: string };
      }
    | { streamId: string; kind: 'finish' }
    | { streamId: string; kind: 'session'; payload: { provider: string; sessionId: string } };

type CliBridge = {
    startStream: (req: {
        streamId: string;
        provider: string;
        model: string;
        messages: ReadonlyArray<{ role: string; content: string }>;
        workingDirectory?: string;
        resumeSessionId?: string;
        readOnly?: boolean;
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

export type CliTransportContext = {
    /** Private working copy root of the active local branch; null for cloud projects. */
    getWorkingDirectory: () => string | null;
    getActiveBranchId: () => string | null;
    getConversationId: () => string;
};

export class WeblabCliTransport implements ChatTransport<UIMessage> {
    constructor(
        private readonly getModel?: () => string | undefined,
        private readonly context?: CliTransportContext,
    ) {}

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

        const workingDirectory = this.context?.getWorkingDirectory() ?? null;
        if (!workingDirectory) {
            // TODO(i18n): move to messages/* with the other chat errors.
            throw new Error(
                `Open a local folder to use ${getProviderManifest(provider).label}. Cloud projects can't run CLI models.`,
            );
        }

        const latestUserMessage = [...options.messages].reverse().find((m) => m.role === 'user');
        const diagnosisBranchId = startupDiagnosisBranch(
            latestUserMessage ? flattenContent(latestUserMessage) : '',
        );
        if (diagnosisBranchId && this.context?.getActiveBranchId() !== diagnosisBranchId) {
            throw new Error(
                'The active branch changed. Start the diagnosis again from its preview.',
            );
        }
        const conversationId = this.context?.getConversationId() ?? null;
        const stored = conversationId ? loadCliSession(conversationId) : null;
        const resumeSessionId =
            !diagnosisBranchId &&
            canResumeCliSession(stored, {
                provider,
                workingDirectory,
                messages: options.messages,
            })
                ? stored?.sessionId
                : undefined;

        const cliMessages = (
            diagnosisBranchId && latestUserMessage ? [latestUserMessage] : options.messages
        ).map((m) => ({
            role: m.role,
            content: flattenContent(m),
        }));

        let unsubscribe: (() => void) | null = null;
        let assistantMessageId: string | null = null;
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
                        if (event.payload.type === 'start' && event.payload.messageId) {
                            assistantMessageId = event.payload.messageId;
                        }
                        try {
                            controller.enqueue(event.payload);
                        } catch {
                            // stream may have closed mid-flight
                        }
                    } else if (event.kind === 'session') {
                        // Remember the CLI session so the next turn resumes it
                        // instead of replaying the whole conversation.
                        if (conversationId && assistantMessageId) {
                            saveCliSession(conversationId, {
                                provider,
                                sessionId: event.payload.sessionId,
                                workingDirectory,
                                lastAssistantMessageId: assistantMessageId,
                            });
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
                    .startStream({
                        streamId,
                        provider,
                        model,
                        messages: cliMessages,
                        workingDirectory,
                        resumeSessionId,
                        readOnly: diagnosisBranchId !== null,
                    })
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
