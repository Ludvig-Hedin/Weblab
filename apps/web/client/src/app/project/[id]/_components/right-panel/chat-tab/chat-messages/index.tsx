'use client';

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { type ChatMessage } from '@weblab/models/chat';
import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from '@weblab/ui/ai-elements';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { assertNever } from '@weblab/utility';

import type { EditMessage } from '@/app/project/[id]/_hooks/use-chat';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { AssistantMessage } from './assistant-message';
import { ErrorMessage } from './error-message';
import { UserMessage } from './user-message';

const STARTER_SUGGESTIONS = [
    {
        key: 'darkMode',
        icon: Icons.Sparkles,
        transKey: transKeys.editor.panels.edit.tabs.chat.starters.darkMode,
    },
    {
        key: 'modernizeHero',
        icon: Icons.LayoutWindow,
        transKey: transKeys.editor.panels.edit.tabs.chat.starters.modernizeHero,
    },
    {
        key: 'mobileLayout',
        icon: Icons.Mobile,
        transKey: transKeys.editor.panels.edit.tabs.chat.starters.mobileLayout,
    },
    {
        key: 'polish',
        icon: Icons.Pencil,
        transKey: transKeys.editor.panels.edit.tabs.chat.starters.polish,
    },
] as const;

const getLatestAssistantMessageId = (messages: ChatMessage[]) =>
    [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null;

interface ChatMessagesProps {
    messages: ChatMessage[];
    onEditMessage: EditMessage;
    onRegenerateLastAssistant: () => Promise<void>;
    onSuggestionClick?: (text: string) => void;
    isStreaming: boolean;
    error?: Error;
}

export const ChatMessages = observer(
    ({
        messages,
        onEditMessage,
        onRegenerateLastAssistant,
        onSuggestionClick,
        isStreaming,
        error,
    }: ChatMessagesProps) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();
        const latestAssistantMessageId = getLatestAssistantMessageId(messages);

        const renderMessage = useCallback(
            (message: ChatMessage) => {
                switch (message.role) {
                    case 'assistant': {
                        const isLatestAssistant = message.id === latestAssistantMessageId;
                        return (
                            <div key={message.id} className="my-2">
                                <AssistantMessage
                                    key={message.id}
                                    message={message}
                                    isStreaming={isStreaming && isLatestAssistant}
                                    // Only the latest assistant message gets
                                    // the regenerate affordance + streaming
                                    // flag, so non-latest assistant messages
                                    // keep stable props and stay memoized
                                    // across global streaming-state changes.
                                    isLatestAssistant={isLatestAssistant}
                                    isAnyStreaming={isLatestAssistant ? isStreaming : false}
                                    onRegenerate={
                                        isLatestAssistant ? onRegenerateLastAssistant : undefined
                                    }
                                />
                            </div>
                        );
                    }
                    case 'user':
                        return (
                            <div key={message.id} className="my-2">
                                <UserMessage
                                    key={message.id}
                                    onEditMessage={onEditMessage}
                                    message={message}
                                />
                            </div>
                        );
                    case 'system':
                        return null;
                    default:
                        assertNever(message.role);
                }
            },
            [latestAssistantMessageId, onEditMessage, isStreaming, onRegenerateLastAssistant],
        );

        if (!messages || messages.length === 0) {
            return (
                !editorEngine.elements.selected.length && (
                    <div className="text-foreground-tertiary/80 flex h-full flex-1 flex-col items-center justify-center gap-5 px-6">
                        <Icons.EmptyState className="size-32" />
                        <p className="text-regularPlus max-w-[300px] text-center text-balance">
                            {t(transKeys.editor.panels.edit.tabs.chat.emptyState)}
                        </p>
                        {onSuggestionClick && (
                            <div
                                className="flex flex-wrap justify-center gap-2"
                                aria-label="Starter suggestions"
                            >
                                {STARTER_SUGGESTIONS.map(({ key, icon: SuggestionIcon, transKey }) => {
                                    const label = t(transKey);
                                    return (
                                        <Button
                                            key={key}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onSuggestionClick(label)}
                                        >
                                            <SuggestionIcon className="h-3.5 w-3.5 shrink-0" />
                                            {label}
                                        </Button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )
            );
        }

        return (
            <Conversation>
                <ConversationContent className="m-0 p-0">
                    {messages.map((message) => renderMessage(message))}
                    {error && <ErrorMessage error={error} />}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>
        );
    },
);
