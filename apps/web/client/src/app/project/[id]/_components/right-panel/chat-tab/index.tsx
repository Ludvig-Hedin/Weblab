import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { ChatTabContent } from './chat-tab-content';

interface ChatTabProps {
    conversationId: string;
    projectId: string;
}

export const ChatTab = ({ conversationId, projectId }: ChatTabProps) => {
    const t = useTranslations();
    const {
        data: initialMessages,
        isLoading,
        isError,
        refetch,
    } = api.chat.message.getAll.useQuery(
        { conversationId: conversationId },
        {
            enabled: !!conversationId,
            // Pick up assistant messages that finished streaming in another
            // tab/window while this tab was backgrounded.
            refetchOnWindowFocus: true,
        },
    );

    if (isError) {
        return (
            <div className="text-foreground-secondary flex h-full w-full flex-1 flex-col items-center justify-center gap-2">
                <p className="text-small">{t(transKeys.editor.panels.edit.tabs.chat.loadFailed)}</p>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    {t(transKeys.editor.panels.edit.tabs.chat.retry)}
                </Button>
            </div>
        );
    }

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
            initialMessages={initialMessages}
        />
    );
};
