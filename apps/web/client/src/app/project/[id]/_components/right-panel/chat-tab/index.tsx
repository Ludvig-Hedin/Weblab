import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';
import { fromConvexMessage } from '../../../_adapters/convex-bootstrap';
import { ChatTabContent } from './chat-tab-content';

interface ChatTabProps {
    conversationId: string;
    projectId: string;
}

export const ChatTab = ({ conversationId, projectId }: ChatTabProps) => {
    const t = useTranslations();
    // Convex 'skip' goes in arg 2, not arg 1. Passing 'skip' as the function
    // ref triggers `Could not find public function for 'skip'` and detonates.
    const initialMessages = useQuery(
        api.messages.listByConversation,
        conversationId
            ? { conversationId: conversationId as Id<'conversations'> }
            : 'skip',
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
            initialMessages={initialMessages.map(fromConvexMessage)}
        />
    );
};
