import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import type { ChatMessage } from '@weblab/models';
import { Icons } from '@weblab/ui/icons/index';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';
import { ChatTabContent } from './chat-tab-content';

interface ChatTabProps {
    conversationId: string;
    projectId: string;
}

export const ChatTab = ({ conversationId, projectId }: ChatTabProps) => {
    const t = useTranslations();
    const initialMessages = useQuery(
        (conversationId
            ? api.messages.listByConversation
            : 'skip') as typeof api.messages.listByConversation,
        conversationId
            ? { conversationId: conversationId as Id<'conversations'> }
            : (undefined as unknown as { conversationId: Id<'conversations'> }),
    );
    const isLoading = initialMessages === undefined;

    if (!initialMessages || isLoading) {
        return (
            <div className="text-foreground-secondary flex h-full w-full flex-1 items-center justify-center">
                <Icons.LoadingSpinner className="mr-2 animate-spin" />
                <p>{t(transKeys.editor.panels.edit.tabs.chat.loadingMessages)}</p>
            </div>
        );
    }

    return (
        <ChatTabContent
            // Used to force re-render the use-chat hook when the conversationId changes
            key={conversationId}
            conversationId={conversationId}
            projectId={projectId}
            initialMessages={initialMessages as unknown as ChatMessage[]}
        />
    );
};
