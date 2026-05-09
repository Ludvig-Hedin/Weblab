'use client';

import { useEffect, useState } from 'react';

import { inferProviderFromModelId } from '@weblab/ai/client';

import { isOllamaReachable } from './ollama-client';
import { useOnlineStatus } from './online-status';

export interface AiAvailability {
    canUseAi: boolean;
    reason: 'online' | 'ollama-local' | 'offline-no-local-model';
    message: string;
}

/**
 * Reports whether AI features can run right now and why. UI surfaces (chat
 * input, inline-edit affordances, tab-complete) should disable themselves
 * when `canUseAi` is false and show `message` so the user understands.
 */
export function useAiAvailability(selectedModel?: string, ollamaBaseUrl?: string): AiAvailability {
    const online = useOnlineStatus();
    const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);

    useEffect(() => {
        if (online) {
            setOllamaReachable(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            const reachable = await isOllamaReachable(ollamaBaseUrl);
            if (!cancelled) setOllamaReachable(reachable);
        })();
        return () => {
            cancelled = true;
        };
    }, [online, ollamaBaseUrl]);

    if (online) {
        return {
            canUseAi: true,
            reason: 'online',
            message: 'AI ready.',
        };
    }

    const provider = selectedModel ? inferProviderFromModelId(selectedModel) : undefined;
    if (provider === 'ollama' && ollamaReachable) {
        return {
            canUseAi: true,
            reason: 'ollama-local',
            message: 'Using local Ollama model — your chat stays on this machine.',
        };
    }

    return {
        canUseAi: false,
        reason: 'offline-no-local-model',
        message:
            provider === 'ollama'
                ? "Ollama isn't reachable on localhost:11434 — start it to chat offline."
                : 'AI is unavailable while offline. Switch to a local Ollama model or reconnect.',
    };
}
