import type { ConvexHttpClient } from 'convex/browser';
import { makeAutoObservable } from 'mobx';

import type { ChatMessage } from '@weblab/models';

import type { EditorEngine } from '../engine';
import { api as convexApi } from '@convex/_generated/api';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';

// ConvexHttpClient comes from the shared singleton — its Clerk auth token is
// wired by <ConvexAuthBridge> mounted in clerk-convex-providers.tsx.

export class ApiManager {
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async webSearch(input: {
        query: string;
        allowed_domains: string[] | undefined;
        blocked_domains: string[] | undefined;
    }) {
        return this.convex.action(convexApi.utils.webSearch, input);
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
        return this.convex.action(convexApi.utils.applyDiff, input);
    }

    async scrapeUrl(input: {
        url: string;
        formats?: ('json' | 'markdown' | 'html' | 'branding' | 'screenshot')[] | undefined;
        onlyMainContent?: boolean | undefined;
        includeTags?: string[] | undefined;
        excludeTags?: string[] | undefined;
        waitFor?: number | undefined;
    }) {
        return this.convex.action(convexApi.utils.scrapeUrl, input);
    }

    async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
        const id = conversationId as Parameters<
            typeof this.convex.query<typeof convexApi.messages.listByConversation>
        >[1]['conversationId'];
        return (await this.convex.query(convexApi.messages.listByConversation, {
            conversationId: id,
        })) as unknown as ChatMessage[];
    }
}
