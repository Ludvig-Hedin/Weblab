'use client';

import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

import { shouldUseCliBridge } from './cli-transport';

/**
 * Wrap two transports and pick at request time. When the desktop CLI bridge is
 * present *and* the selected model belongs to a CLI provider, route to the
 * `cliTransport`. Otherwise fall through to the default HTTP transport.
 *
 * This is the seam that lets a single `useChat` instance handle both hosted
 * cloud models and local CLI providers without duplicating the chat surface.
 */
export class RoutingChatTransport implements ChatTransport<UIMessage> {
    constructor(
        private readonly httpTransport: ChatTransport<UIMessage>,
        private readonly cliTransport: ChatTransport<UIMessage>,
    ) {}

    private pick(body: unknown): ChatTransport<UIMessage> {
        const model = (body as { model?: string } | undefined)?.model;
        if (typeof model === 'string' && shouldUseCliBridge(model)) {
            return this.cliTransport;
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
