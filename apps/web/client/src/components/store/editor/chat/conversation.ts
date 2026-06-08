import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import localforage from 'localforage';
import { makeAutoObservable, runInAction } from 'mobx';
import { toast } from 'sonner';

import type { ChatConversation } from '@weblab/models';
import { AgentType } from '@weblab/models';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import { clearQueue } from '@/app/project/[id]/_hooks/use-chat/queue-storage';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';
import { lastActiveConversationKey } from '@/utils/constants';

// Convex stores conversations with `_id` / `displayName` / `_creationTime` /
// numeric `updatedAt`. The editor was written against the Drizzle-era
// `ChatConversation` shape (`id` / `title` / `Date` timestamps), so normalise
// every Convex doc that flows back through the store so downstream components
// keep working without learning two shapes.
type ConvexConversationDoc = {
    _id: string;
    _creationTime: number;
    projectId: string;
    agentType?: string;
    displayName?: string;
    updatedAt: number;
    suggestions?: unknown;
};

let lastActiveConversationStorageWarningShown = false;

function warnLastActiveConversationStorage(operation: 'read' | 'write', error: unknown): void {
    if (lastActiveConversationStorageWarningShown) return;
    lastActiveConversationStorageWarningShown = true;
    console.warn(`Could not ${operation} last active conversation id from browser storage`, error);
}

function normalizeConversation(doc: ConvexConversationDoc): ChatConversation {
    return {
        id: doc._id,
        agentType: (doc.agentType as AgentType | undefined) ?? AgentType.ROOT,
        title: doc.displayName ?? null,
        projectId: doc.projectId,
        createdAt: new Date(doc._creationTime),
        updatedAt: new Date(doc.updatedAt),
        suggestions: Array.isArray(doc.suggestions)
            ? (doc.suggestions as ChatConversation['suggestions'])
            : [],
    };
}

interface CurrentConversation extends ChatConversation {
    messageCount: number;
}

export class ConversationManager {
    current: CurrentConversation | null = null;
    conversations: ChatConversation[] = [];
    creatingConversation = false;
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async applyConversations(conversations: ChatConversation[]) {
        runInAction(() => {
            this.conversations = conversations;
        });
        if (conversations.length === 0) {
            await this.startNewConversation();
            return;
        }

        // Prefer the conversation the user most recently had open in this
        // browser, so a system-side `updatedAt` bump (auto-titling, collaborator
        // edits) doesn't shuffle them into a different thread on return.
        const lastActiveId = await this.readLastActiveConversationId();
        const restored = lastActiveId
            ? conversations.find((c) => c.id === lastActiveId)
            : undefined;

        // conversations is non-empty (early-return above guards the empty case),
        // so target is always defined here.
        const target = (restored ?? conversations[0])!;
        await this.selectConversation(target.id);
    }

    private async readLastActiveConversationId(): Promise<string | null> {
        try {
            return await localforage.getItem<string>(
                lastActiveConversationKey(this.editorEngine.projectId),
            );
        } catch (error) {
            warnLastActiveConversationStorage('read', error);
            return null;
        }
    }

    private writeLastActiveConversationId(id: string) {
        // Fire-and-forget: don't block selection on storage I/O.
        void localforage
            .setItem(lastActiveConversationKey(this.editorEngine.projectId), id)
            .catch((error) => {
                warnLastActiveConversationStorage('write', error);
            });
    }

    async getConversations(projectId: string): Promise<ChatConversation[]> {
        const res: ChatConversation[] | null = await this.getConversationsFromStorage(projectId);
        if (!res) {
            console.error('No conversations found');
            return [];
        }
        const conversations = res;

        const sorted = conversations.sort((a, b) => {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return sorted || [];
    }

    setConversationLength(length: number) {
        if (this.current) {
            this.current = {
                ...this.current,
                messageCount: length,
            };
        }
    }

    async startNewConversation() {
        try {
            runInAction(() => {
                this.creatingConversation = true;
            });
            if (this.current?.messageCount === 0 && !this.current?.title) {
                // Already in a fresh, untitled conversation — nothing to create.
                return;
            }
            const projectId = this.editorEngine.projectId as Id<'projects'>;
            const created = (await this.convex.mutation(convexApi.conversations.upsert, {
                projectId,
            })) as ConvexConversationDoc;
            const newConversation = normalizeConversation(created);
            runInAction(() => {
                this.current = {
                    ...newConversation,
                    messageCount: 0,
                };
                this.conversations.push(newConversation);
            });
        } catch (error) {
            console.error('Error starting new conversation', error);
            toast.error('Error starting new conversation.', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            runInAction(() => {
                this.creatingConversation = false;
            });
        }
    }

    async selectConversation(id: string) {
        const match = this.conversations.find((c) => c.id === id);
        if (!match) {
            console.error('No conversation found with id', id);
            return;
        }

        runInAction(() => {
            this.current = {
                ...match,
                messageCount: 0,
            };
        });
        this.writeLastActiveConversationId(id);
    }

    async deleteConversation(id: string): Promise<void> {
        if (!this.current) {
            console.error('No conversation found');
            return;
        }

        const index = this.conversations.findIndex((c) => c.id === id);
        if (index === -1) {
            console.error('No conversation found with id', id);
            return;
        }

        // Pessimistic delete: await server first so a network failure surfaces
        // to the caller before we mutate local state. Caller toasts the error.
        await this.deleteConversationInStorage(id);

        clearQueue(id);

        runInAction(() => {
            this.conversations.splice(index, 1);
        });
        if (this.current?.id === id) {
            if (this.conversations.length > 0 && !!this.conversations[0]) {
                void this.selectConversation(this.conversations[0].id);
            } else {
                void this.startNewConversation();
            }
        }
    }

    async generateTitle(content: string): Promise<void> {
        if (!this.current) {
            console.error('No conversation found');
            return;
        }
        const conversationId = this.current.id as Id<'conversations'>;
        let title: string | null = null;
        try {
            title = await this.convex.action(convexApi.chatActions.generateTitle, {
                conversationId,
                content,
            });
        } catch (error) {
            console.error('Error generating conversation title:', error);
            return;
        }
        if (!title) {
            console.error('Error generating conversation title. No title returned.');
            return;
        }
        runInAction(() => {
            if (!this.current) return;
            // Update local active conversation
            this.current = {
                ...this.current,
                title,
            };
            // Update in local conversations list
            const index = this.conversations.findIndex((c) => c.id === this.current?.id);
            if (index !== -1 && this.conversations[index]) {
                this.conversations[index] = {
                    ...this.conversations[index],
                    title,
                };
            }
        });
    }

    async getConversationsFromStorage(id: string): Promise<ChatConversation[] | null> {
        const projectId = id as Id<'projects'>;
        const docs = (await this.convex.query(convexApi.conversations.list, {
            projectId,
        })) as ConvexConversationDoc[];
        return docs.map(normalizeConversation);
    }

    async upsertConversationInStorage(
        conversation: Partial<ChatConversation>,
    ): Promise<ChatConversation> {
        const projectId = this.editorEngine.projectId as Id<'projects'>;
        const args: {
            projectId: Id<'projects'>;
            id?: Id<'conversations'>;
            displayName?: string;
            agentType?: AgentType;
        } = { projectId };
        if (conversation.id) args.id = conversation.id as Id<'conversations'>;
        if (conversation.title != null) args.displayName = conversation.title;
        if (conversation.agentType) args.agentType = conversation.agentType;
        const doc = (await this.convex.mutation(
            convexApi.conversations.upsert,
            args,
        )) as ConvexConversationDoc;
        return normalizeConversation(doc);
    }

    async updateConversationInStorage(conversation: Partial<ChatConversation> & { id: string }) {
        const conversationId = conversation.id as Id<'conversations'>;
        const args: {
            conversationId: Id<'conversations'>;
            displayName?: string;
            agentType?: AgentType;
        } = { conversationId };
        if (conversation.title != null) args.displayName = conversation.title;
        if (conversation.agentType) args.agentType = conversation.agentType;
        await this.convex.mutation(convexApi.conversations.update, args);
    }

    async deleteConversationInStorage(id: string) {
        const conversationId = id as Id<'conversations'>;
        await this.convex.mutation(convexApi.conversations.remove, { conversationId });
    }

    clear() {
        this.current = null;
        this.conversations = [];
    }
}
