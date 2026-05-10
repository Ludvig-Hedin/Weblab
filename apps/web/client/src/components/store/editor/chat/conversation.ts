import localforage from 'localforage';
import { makeAutoObservable } from 'mobx';
import { toast } from 'sonner';

import { type ChatConversation } from '@weblab/models';

import type { EditorEngine } from '../engine';
import { clearQueue } from '@/app/project/[id]/_hooks/use-chat/queue-storage';
import { api } from '@/trpc/client';
import { lastActiveConversationKey } from '@/utils/constants';

interface CurrentConversation extends ChatConversation {
    messageCount: number;
}

export class ConversationManager {
    current: CurrentConversation | null = null;
    conversations: ChatConversation[] = [];
    creatingConversation = false;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async applyConversations(conversations: ChatConversation[]) {
        this.conversations = conversations;
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
            console.error('Error reading last active conversation id', error);
            return null;
        }
    }

    private writeLastActiveConversationId(id: string) {
        // Fire-and-forget: don't block selection on storage I/O.
        void localforage
            .setItem(lastActiveConversationKey(this.editorEngine.projectId), id)
            .catch((error) => {
                console.error('Error persisting last active conversation id', error);
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
            this.creatingConversation = true;
            if (this.current?.messageCount === 0 && !this.current?.title) {
                // Already in a fresh, untitled conversation — nothing to create.
                return;
            }
            const newConversation = await api.chat.conversation.upsert.mutate({
                projectId: this.editorEngine.projectId,
            });
            this.current = {
                ...newConversation,
                messageCount: 0,
            };
            this.conversations.push(newConversation);
        } catch (error) {
            console.error('Error starting new conversation', error);
            toast.error('Error starting new conversation.', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            this.creatingConversation = false;
        }
    }

    async selectConversation(id: string) {
        const match = this.conversations.find((c) => c.id === id);
        if (!match) {
            console.error('No conversation found with id', id);
            return;
        }

        this.current = {
            ...match,
            messageCount: 0,
        };
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

        this.conversations.splice(index, 1);
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
        const title = await api.chat.conversation.generateTitle.mutate({
            conversationId: this.current?.id,
            content,
        });
        if (!title) {
            console.error('Error generating conversation title. No title returned.');
            return;
        }
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
    }

    async getConversationsFromStorage(id: string): Promise<ChatConversation[] | null> {
        return api.chat.conversation.getAll.query({ projectId: id });
    }

    async upsertConversationInStorage(
        conversation: Partial<ChatConversation>,
    ): Promise<ChatConversation> {
        return await api.chat.conversation.upsert.mutate({
            ...conversation,
            projectId: this.editorEngine.projectId,
        });
    }

    async updateConversationInStorage(conversation: Partial<ChatConversation> & { id: string }) {
        await api.chat.conversation.update.mutate(conversation);
    }

    async deleteConversationInStorage(id: string) {
        await api.chat.conversation.delete.mutate({ conversationId: id });
    }

    clear() {
        this.current = null;
        this.conversations = [];
    }
}
