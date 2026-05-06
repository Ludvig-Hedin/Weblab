'use client';

import type { LanguageModelUsage } from 'ai';
import { useMemo } from 'react';

import { MODEL_MAX_TOKENS, OPENROUTER_MODELS } from '@weblab/models';
import {
    Context,
    ContextCacheUsage,
    ContextContent,
    ContextContentBody,
    ContextContentFooter,
    ContextContentHeader,
    ContextInputUsage,
    ContextOutputUsage,
    ContextReasoningUsage,
    ContextTrigger,
} from '@weblab/ui/ai-elements/context';

export const ChatContextWindow = ({ usage }: { usage: LanguageModelUsage }) => {
    const showCost = false;
    // Hardcoded for now, but should be dynamic based on the model used
    const maxTokens = MODEL_MAX_TOKENS[OPENROUTER_MODELS.CLAUDE_OPUS_4_7] ?? 0;
    const usedTokens = useMemo(() => {
        if (!usage) return 0;
        const input = usage.inputTokens ?? 0;
        const cached = usage.cachedInputTokens ?? 0;
        return input + cached;
    }, [usage]);

    return (
        <Context maxTokens={maxTokens} usedTokens={usedTokens} usage={usage}>
            <ContextTrigger />
            <ContextContent>
                <ContextContentHeader />
                <ContextContentBody>
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                </ContextContentBody>
                {showCost && <ContextContentFooter />}
            </ContextContent>
        </Context>
    );
};
