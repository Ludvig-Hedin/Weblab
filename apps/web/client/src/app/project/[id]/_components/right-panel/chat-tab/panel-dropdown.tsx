import { useCallback, useEffect, useMemo } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { ChatSettings } from '@weblab/models';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';

export const ChatPanelDropdown = observer(
    ({
        children,
        isChatHistoryOpen,
        setIsChatHistoryOpen,
    }: {
        children: React.ReactNode;
        isChatHistoryOpen: boolean;
        setIsChatHistoryOpen: (isOpen: boolean) => void;
    }) => {
        const t = useTranslations();
        const updateSettings = useMutation(api.users.updateSettings);
        const userSettings = useQuery(api.users.getSettings, {});

        const debouncedUpdateSettings = useMemo(
            () =>
                debounce((settings: Partial<ChatSettings>) => {
                    void updateSettings(settings);
                }, 300),
            [updateSettings],
        );

        useEffect(() => {
            return () => {
                debouncedUpdateSettings.cancel();
            };
        }, [debouncedUpdateSettings]);

        const updateChatSettings = useCallback(
            (e: React.MouseEvent, settings: Partial<ChatSettings>) => {
                e.preventDefault();
                debouncedUpdateSettings(settings);
            },
            [debouncedUpdateSettings],
        );

        // TODO(convex-migration): users.getSettings returns the flat DB row; wire fromDbUserSettings or expose a getMappedSettings query
        const showSuggestions = userSettings?.showSuggestions ?? false;
        const showMiniChat = userSettings?.showMiniChat ?? false;

        return (
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <div className="flex items-center">{children}</div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px] rounded-md p-1">
                    <DropdownMenuItem
                        onClick={() => setIsChatHistoryOpen(!isChatHistoryOpen)}
                        className="text-mini flex items-center rounded-sm px-2 py-1.5"
                    >
                        <Icons.CounterClockwiseClock className="mr-2 h-3.5 w-3.5" />
                        {t(transKeys.editor.panels.edit.tabs.chat.controls.history)}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuLabel className="text-foreground-tertiary text-microPlus px-2 py-1 font-normal tracking-normal">
                        {t(transKeys.editor.panels.edit.tabs.chat.settings.displayHeading)}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        className="text-mini flex items-center justify-between rounded-sm px-2 py-1.5"
                        onClick={(e) => {
                            updateChatSettings(e, {
                                showSuggestions: !showSuggestions,
                            });
                        }}
                    >
                        <span>
                            {t(transKeys.editor.panels.edit.tabs.chat.settings.showSuggestions)}
                        </span>
                        <span
                            aria-hidden
                            className={cn(
                                'flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
                                showSuggestions
                                    ? 'bg-foreground-primary'
                                    : 'bg-background-tertiary',
                            )}
                        >
                            <span
                                className={cn(
                                    'h-3 w-3 rounded-full transition-transform',
                                    showSuggestions
                                        ? 'bg-background translate-x-3'
                                        : 'bg-foreground-tertiary translate-x-0',
                                )}
                            />
                        </span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        className="text-mini flex items-center justify-between rounded-sm px-2 py-1.5"
                        onClick={(e) => {
                            updateChatSettings(e, {
                                showMiniChat: !showMiniChat,
                            });
                        }}
                    >
                        <span>
                            {t(transKeys.editor.panels.edit.tabs.chat.settings.showMiniChat)}
                        </span>
                        <span
                            aria-hidden
                            className={cn(
                                'flex h-4 w-7 items-center rounded-full p-0.5 transition-colors',
                                showMiniChat ? 'bg-foreground-primary' : 'bg-background-tertiary',
                            )}
                        >
                            <span
                                className={cn(
                                    'h-3 w-3 rounded-full transition-transform',
                                    showMiniChat
                                        ? 'bg-background translate-x-3'
                                        : 'bg-foreground-tertiary translate-x-0',
                                )}
                            />
                        </span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    },
);
