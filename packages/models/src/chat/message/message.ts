import type { FinishReason, InferUITools, JSONValue, LanguageModelUsage, ToolSet, UIMessage, UIMessagePart } from 'ai';

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
// The tool registry already returns ToolSet. Infer the same message shape here
// without importing its implementations and the web editor into shared models.
type ChatTools = InferUITools<ToolSet>;
export type ChatDataPart = {};
export type ChatMessagePart = UIMessagePart<ChatDataPart, ChatTools>;
export type ChatMessage = UIMessage<ChatMetadata, ChatDataPart, ChatTools>;
