'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

import { inferProviderFromModelId } from '@weblab/ai';

import { isOnline } from '@/services/offline/online-status';
import { shouldUseCliBridge } from './cli-transport';

/**
 * Wrap two/three transports and pick at request time:
 *   - offline + Ollama model selected → `ollamaWebTransport` (browser → localhost:11434 direct)
 *   - desktop CLI bridge present + CLI provider → `cliTransport`
 *   - otherwise → HTTP transport (`/api/chat`)
 *
 * `getModel` is a closure over the renderer's currently-selected model. It is
 * the source of truth for routing — `options.body.model` from `sendMessages`
 * only contains per-call body fields, NOT the constructor body of the
 * underlying DefaultChatTransport. Without `getModel`, switching to a CLI or
 * Ollama provider would silently fall through to the HTTP transport.
 */
export class RoutingChatTransport implements ChatTransport<UIMessage> {
    constructor(
        private readonly httpTransport: ChatTransport<UIMessage>,
        private readonly cliTransport: ChatTransport<UIMessage>,
        private readonly getModel?: () => string | undefined,
        private readonly ollamaWebTransport?: ChatTransport<UIMessage>,
    ) {}

    private pick(body: unknown): ChatTransport<UIMessage> {
        const callBodyModel = (body as { model?: string } | undefined)?.model;
        const model = callBodyModel ?? this.getModel?.();

        if (typeof model === 'string') {
            const provider = inferProviderFromModelId(model);
            if (!isOnline() && provider === 'ollama' && this.ollamaWebTransport) {
                return this.ollamaWebTransport;
            }
            if (shouldUseCliBridge(model)) {
                return this.cliTransport;
            }
        }
        return this.httpTransport;
    }

    sendMessages(
        options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
    ): Promise<ReadableStream<UIMessageChunk>> {
        return this.pick(options.body).sendMessages(options);
    }

    reconnectToStream(
        options: Parameters<ChatTransport<UIMessage>['reconnectToStream']>[0],
    ): Promise<ReadableStream<UIMessageChunk> | null> {
        return this.pick(options.body).reconnectToStream(options);
    }
}
