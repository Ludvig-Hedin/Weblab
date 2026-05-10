'use client';

import type { LanguageModelUsage } from 'ai';
import { useMemo } from 'react';

import type { ChatModel } from '@weblab/models';
import { getMaxTokens } from '@weblab/models';
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

export const ChatContextWindow = ({
    usage,
    model,
}: {
    usage: LanguageModelUsage;
    model: ChatModel;
}) => {
    const showCost = false;
    const maxTokens = getMaxTokens(model);
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
