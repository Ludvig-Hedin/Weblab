import type { FinishReason, JSONValue, LanguageModelUsage, UIMessage, UIMessagePart } from 'ai';

import type { ChatTools } from '@weblab/ai';

import type { MessageCheckpoints } from './checkpoint';
import type { MessageContext } from './context';

export type ChatMetadata = {
    createdAt: Date;
    conversationId: string;
    context: MessageContext[];
    checkpoints: MessageCheckpoints[];
    finishReason?: FinishReason;
    usage?: LanguageModelUsage;
    error?: string;
    /**
     * The concrete model that actually ran. Set when the user picked "Auto"
     * and the router resolved a real model — surfaced in the UI so the user
     * can see what's powering their reply.
     */
    resolvedModel?: string;
    /** True when `resolvedModel` came from auto routing. */
    resolvedFromAuto?: boolean;
};

export type ChatProviderMetadata = Record<string, Record<string, JSONValue>>;
export type ChatDataPart = {};
export type ChatMessagePart = UIMessagePart<ChatDataPart, ChatTools>;
export type ChatMessage = UIMessage<ChatMetadata, ChatDataPart, ChatTools>;
