/**
 * Single orchestrator for all chat requests.
 *
 * Goals:
 * - One place to assemble the model, prompt blocks, summary, and stream
 * - One project lookup (was two)
 * - Parallel fetches (memories, skills) wherever the data is independent
 * - Pre-resolves auto-routing synchronously so streaming starts immediately
 *
 * The route handler stays thin: auth + usage gate → buildChatRequest →
 * return its stream.
 */
import type { LanguageModelUsage, StreamTextResult, ToolSet } from 'ai';

import type { FrameworkId } from '@weblab/framework';
import type {
    ChatMessage,
    ChatModel,
    OPENROUTER_MODELS as Models,
    ReasoningEffort,
} from '@weblab/models';
import { ChatType, LLMProvider } from '@weblab/models';

import type { MemorySearchResult } from '../memory/types';
import type { AIUsageEvent } from '../observability';
import type { SkillSummary } from '../skills/types';
import type { ServerToolContext } from '../tools/server-context';
import type { UserTier } from './model-router';
import { createRootAgentStream } from '../agents/root';
import { buildUsageEvent, measureStreamTiming, trackAIUsage } from '../observability';
import { getCachedSystemBlocks, toAnthropicSystemBlocks } from '../prompt/cache-blocks';
import { CREATE_NEW_PAGE_SYSTEM_PROMPT, FIX_SYSTEM_PROMPT } from '../prompt/constants';
import { wrapXml } from '../prompt/helpers';
import { getPlanModeSystemPrompt } from '../prompt/plan';
import { getAskModeSystemPrompt } from '../prompt/provider';
import { countTokensWithRoles } from '../tokens';
import { AUTO_MODEL_ID, resolveAutoModel } from './model-router';
import { resolveProviderForModel } from './providers';
import { applySummaryToMessages } from './summarizer-utils';

/**
 * Inputs the route handler gathers and hands to the orchestrator. Everything
 * here is data — no callbacks, no closures over `req`. Side-effects (Convex
 * mutations, refunds) are wired by the caller via the returned hooks.
 */
export interface BuildChatRequestInput {
    chatType: ChatType;
    /** Raw history from the client. Will be augmented with conversation summary if present. */
    messages: ChatMessage[];
    /** User-selected model. 'auto' triggers the router. */
    selectedModel: ChatModel | 'auto';
    userId: string;
    /** Optional — PLAN pre-creation has no project yet. */
    projectId?: string;
    conversationId: string;
    traceId: string;
    reasoningEffort?: ReasoningEffort;
    ollamaBaseUrl?: string;

    /** From the user's subscription/usage view. */
    tier: UserTier;

    /** Resolved upstream from a SINGLE projects.get call. null when not applicable. */
    framework: FrameworkId | null;
    /** Memories already fetched in parallel with framework. */
    memories: MemorySearchResult[];
    /** Skills already discovered. */
    skills: SkillSummary[];
    /** Stored conversation summary, if one exists. */
    conversationSummary?: { text: string; upToMessageId: string } | null;

    abortSignal?: AbortSignal;
    serverToolContext?: ServerToolContext;
    toolSetOverride?: ToolSet;
}

export interface BuildChatRequestOutput {
    /** The streamText result. Caller invokes .toUIMessageStreamResponse on it. */
    stream: StreamTextResult<ToolSet, unknown>;
    /** Concrete model the request will run on (after Auto resolution). */
    resolvedModel: ChatModel;
    /** True when the resolved model came from auto routing. */
    resolvedFromAuto: boolean;
    /** Wire provider that will carry the call. */
    provider: 'openrouter' | 'ollama' | 'anthropic-direct';
    /** Final list of messages sent to the model (after summary application). */
    sentMessages: ChatMessage[];
    /**
     * Wire this into the route handler's onFinish to fire a structured usage
     * event. Idempotent — safe to invoke once per stream completion.
     *
     * `providerMetadata` is the Anthropic-specific cache stats bag — pass the
     * `providerMetadata` field from the finish-step part. Without it, the
     * dashboard shows 0% cache hit ratio for Anthropic calls.
     */
    finalizeUsage: (args: {
        usage?: LanguageModelUsage;
        providerMetadata?: Record<string, Record<string, unknown>>;
        toolCallCount?: number;
        errorType?: string;
        messageId?: string;
        sink?: (event: AIUsageEvent) => Promise<unknown>;
    }) => Promise<void>;
    /** Mark first token for TTF measurement. Called from streaming hook. */
    onFirstToken: () => void;
}

/**
 * Build a chat request without running the LLM yet — useful for tests that
 * want to inspect the resolved model / messages. Production callers usually
 * want buildChatRequest which also kicks off the stream.
 */
export interface PreparedChatRequest {
    resolvedModel: ChatModel;
    resolvedFromAuto: boolean;
    provider: 'openrouter' | 'ollama' | 'anthropic-direct';
    sentMessages: ChatMessage[];
    estimatedInputTokens: number;
}

export async function prepareChatRequest(
    input: BuildChatRequestInput,
): Promise<PreparedChatRequest> {
    // 1. Apply stored summary first (it changes the message count, which
    // changes the token estimate the router uses).
    const sentMessages = applySummaryToMessages({
        messages: input.messages,
        summary: input.conversationSummary,
    });
    // 2. Estimate input tokens — cheap, sync-ish (gpt-tokenizer).
    const estimatedInputTokens = await countTokensWithRoles(sentMessages);
    // 3. Resolve model. Auto picks via the router; explicit model passes through.
    let resolvedModel: ChatModel;
    let resolvedFromAuto = false;
    if (input.selectedModel === AUTO_MODEL_ID) {
        resolvedModel = resolveAutoModel({
            chatType: input.chatType,
            tier: input.tier,
            estimatedInputTokens,
        });
        resolvedFromAuto = true;
    } else {
        resolvedModel = input.selectedModel;
    }
    // 4. Decide which provider will carry the call. The discriminated union
    // for InitialModelPayload narrows on `provider`; pass the right branch.
    const provider = resolvedModel.startsWith('ollama/')
        ? resolveProviderForModel({
              provider: LLMProvider.OLLAMA,
              model: resolvedModel as `ollama/${string}`,
              ollamaBaseUrl: input.ollamaBaseUrl,
              reasoningEffort: input.reasoningEffort,
          })
        : resolveProviderForModel({
              provider: LLMProvider.OPENROUTER,
              model: resolvedModel as Models,
              reasoningEffort: input.reasoningEffort,
          });
    return {
        resolvedModel,
        resolvedFromAuto,
        provider,
        sentMessages,
        estimatedInputTokens,
    };
}

/**
 * Per-chat-type stable suffix appended to the cached block. Returning
 * different stable text for each chat type means each variant gets its
 * own cache lane (no cross-pollution between EDIT and PLAN).
 */
function getModeSuffix(chatType: ChatType): string | undefined {
    switch (chatType) {
        case ChatType.CREATE:
            return wrapXml('create-system-prompt', CREATE_NEW_PAGE_SYSTEM_PROMPT);
        case ChatType.FIX:
            // FIX reuses the cached Build stable prefix; the fix-mode suffix
            // gives it a distinct cache lane while sharing the heavy prefix.
            return wrapXml('fix-mode', FIX_SYSTEM_PROMPT);
        default:
            return undefined;
    }
}

function buildSystemPrompt(input: BuildChatRequestInput): string {
    if (input.chatType === ChatType.ASK) {
        return getAskModeSystemPrompt(input.memories, input.framework, input.skills);
    }
    if (input.chatType === ChatType.PLAN) {
        return getPlanModeSystemPrompt(input.memories, input.framework, input.skills);
    }

    const blocks = getCachedSystemBlocks({
        framework: input.framework,
        memories: input.memories,
        skills: input.skills,
        modeSuffix: getModeSuffix(input.chatType),
    });
    return `${blocks.stable}${blocks.volatile ? `\n\n${blocks.volatile}` : ''}`;
}

/**
 * Main entry point. Builds, resolves, summarises, prompt-assembles, and
 * kicks off the stream. Returns hooks the route handler can wire into
 * onFinish / onError for telemetry.
 */
export async function buildChatRequest(
    input: BuildChatRequestInput,
): Promise<BuildChatRequestOutput> {
    const prepared = await prepareChatRequest(input);

    // Pass `system` as a single flattened string. The Vercel AI SDK V5 `system`
    // parameter is string-typed — per-block content arrays are only legal when
    // injected as a role:'system' message inside `messages`. We rely on the
    // provider-level `cacheControl: { type: 'ephemeral' }` set in providers.ts
    // to cache the whole prompt for Anthropic. The stable/volatile split is
    // still useful because the stable text comes first; when memories churn,
    // Anthropic invalidates only the suffix delta, so most of the prefix
    // stays cache-hot for the SAME user across turns.
    //
    // True per-block markers require switching to messages-array assembly
    // (see toAnthropicSystemBlocks, currently unused) — deferred.
    const systemBlocks = buildSystemPrompt(input);
    void toAnthropicSystemBlocks; // keep export wired for future use

    const timing = measureStreamTiming();
    timing.start();

    const stream = createRootAgentStream({
        chatType: input.chatType,
        conversationId: input.conversationId,
        projectId: input.projectId ?? '',
        userId: input.userId,
        traceId: input.traceId,
        messages: prepared.sentMessages,
        model: prepared.resolvedModel,
        ollamaBaseUrl: input.ollamaBaseUrl,
        reasoningEffort: input.reasoningEffort,
        memories: input.memories,
        framework: input.framework,
        skills: input.skills,
        abortSignal: input.abortSignal,
        serverToolContext: input.serverToolContext,
        toolSetOverride: input.toolSetOverride,
        systemBlocks,
    });

    let finalized = false;
    const finalizeUsage: BuildChatRequestOutput['finalizeUsage'] = async ({
        usage,
        providerMetadata,
        toolCallCount,
        errorType,
        messageId,
        sink,
    }) => {
        if (finalized) return;
        finalized = true;
        timing.end();
        // Anthropic exposes cache stats via providerMetadata.anthropic, NOT on
        // the standard `usage` shape. Read both paths so non-Anthropic models
        // still report input/output and Anthropic also reports cache deltas.
        const anthropicMeta = providerMetadata?.anthropic as
            | {
                  cacheReadInputTokens?: number;
                  cacheCreationInputTokens?: number;
              }
            | undefined;
        const event = buildUsageEvent({
            userId: input.userId,
            conversationId: input.conversationId,
            projectId: input.projectId,
            messageId,
            provider: prepared.provider,
            model: prepared.resolvedModel,
            chatType: input.chatType,
            resolvedFromAuto: prepared.resolvedFromAuto,
            usage: {
                inputTokens: usage?.inputTokens,
                outputTokens: usage?.outputTokens,
                totalTokens: usage?.totalTokens,
                cachedInputTokens: anthropicMeta?.cacheReadInputTokens,
                cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens,
            },
            timing: timing.snapshot(),
            toolCallCount,
            errorType,
        });
        await trackAIUsage(event, { sink });
    };

    return {
        stream: stream as unknown as StreamTextResult<ToolSet, unknown>,
        resolvedModel: prepared.resolvedModel,
        resolvedFromAuto: prepared.resolvedFromAuto,
        provider: prepared.provider,
        sentMessages: prepared.sentMessages,
        finalizeUsage,
        onFirstToken: timing.onFirstToken,
    };
}
