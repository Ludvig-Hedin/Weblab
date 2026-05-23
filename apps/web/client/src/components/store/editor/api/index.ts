import { makeAutoObservable } from 'mobx';

import type { ChatMessage } from '@weblab/models';

import type { EditorEngine } from '../engine';
// TODO(convex-migration): non-React class-based store using tRPC vanilla
// client. `api.utils.webSearch`, `api.utils.applyDiff`, `api.utils.scrapeUrl`
// → `api.utils.*` (actions) and `api.chat.message.getAll` →
// `api.messages.listByConversation` once a Convex HTTP client with Clerk
// auth is wired for non-React contexts.
import { api } from '@/trpc/client';

export class ApiManager {
    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async webSearch(input: {
        query: string;
        allowed_domains: string[] | undefined;
        blocked_domains: string[] | undefined;
    }) {
        const result = await api.utils.webSearch.mutate(input);
        return result;
    }

    async applyDiff(input: {
        originalCode: string;
        updateSnippet: string;
        instruction: string;
        metadata: {
            projectId: string;
            conversationId: string | undefined;
        };
    }) {
        return await api.utils.applyDiff.mutate(input);
    }

    async scrapeUrl(input: {
        url: string;
        formats?: ('json' | 'markdown' | 'html' | 'branding' | 'screenshot')[] | undefined;
        onlyMainContent?: boolean | undefined;
        includeTags?: string[] | undefined;
        excludeTags?: string[] | undefined;
        waitFor?: number | undefined;
    }) {
        return await api.utils.scrapeUrl.mutate(input);
    }

    async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
        return await api.chat.message.getAll.query({ conversationId });
    }
}
