'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { streamOllamaChat } from '@/services/offline/ollama-client';

/**
 * Browser-direct Ollama transport used when the user is offline and has a
 * local Ollama daemon running. Bypasses `/api/chat` entirely (which is
 * unreachable offline) by hitting `http://localhost:11434/api/chat` from the
 * renderer. Streams Ollama's native NDJSON and adapts to the AI SDK's
 * UIMessageChunk wire format on the fly.
 */

function flattenContent(message: UIMessage): string {
    const parts = message.parts ?? [];
    return parts
        .filter((p): p is Extract<typeof p, { type: 'text'; text: string }> => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
}

function ollamaModelName(modelId: string): string {
    // Model ids look like `ollama/llama3.2:3b` — strip the provider prefix
    // because the local daemon doesn't accept it.
    return modelId.startsWith('ollama/') ? modelId.slice('ollama/'.length) : modelId;
}

export class OllamaWebTransport implements ChatTransport<UIMessage> {
    constructor(
        private readonly getModel: () => string | undefined,
        private readonly getBaseUrl: () => string | undefined,
    ) {}

    async sendMessages(
        options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
    ): Promise<ReadableStream<UIMessageChunk>> {
        const callBodyModel = (options.body as { model?: string } | undefined)?.model;
        const model = ollamaModelName(callBodyModel ?? this.getModel() ?? '');
        if (!model) {
            throw new Error('No Ollama model selected for offline chat.');
        }

        const ollamaMessages = options.messages.map((m) => ({
            role: m.role === 'user' || m.role === 'assistant' || m.role === 'system'
                ? m.role
                : 'user',
            content: flattenContent(m),
        }));

        const baseUrl = this.getBaseUrl();
        const messageId = uuidv4();

        // Chunk shape verified against ai@v6 UIMessageChunk discriminated union
        // (see node_modules/ai/dist/index.d.ts ~L1714). The SDK consumer needs
        // the full envelope: `start` → `text-start` → `text-delta`* → `text-end`
        // → `finish`. Emitting only text chunks would leave the assistant
        // message in a non-finalized state and breaks `onFinish`.
        return new ReadableStream<UIMessageChunk>({
            async start(controller) {
                let started = false;
                let envelopeStarted = false;
                try {
                    for await (const chunk of streamOllamaChat({
                        baseUrl,
                        model,
                        messages: ollamaMessages,
                        signal: options.abortSignal,
                    })) {
                        if (!envelopeStarted) {
                            controller.enqueue({ type: 'start', messageId });
                            envelopeStarted = true;
                        }
                        if (!started) {
                            controller.enqueue({ type: 'text-start', id: messageId });
                            started = true;
                        }
                        controller.enqueue({
                            type: 'text-delta',
                            id: messageId,
                            delta: chunk,
                        });
                    }
                    if (started) {
                        controller.enqueue({ type: 'text-end', id: messageId });
                    }
                    if (envelopeStarted) {
                        controller.enqueue({ type: 'finish' });
                    }
                    controller.close();
                } catch (err) {
                    try {
                        controller.error(err instanceof Error ? err : new Error(String(err)));
                    } catch {
                        /* already closed */
                    }
                }
            },
        });
    }

    async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
        // Ollama streams aren't resumable. Fresh send required after a tab reload.
        return null;
    }
}
