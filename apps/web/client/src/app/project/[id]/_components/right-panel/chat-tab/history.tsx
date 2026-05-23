import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverAnchor, PopoverContent } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

interface ChatHistoryProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

type GroupKey = 'today' | 'yesterday' | 'lastSevenDays' | 'earlier';

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): number {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
}

function groupForDate(createdAt: Date | string, today: number): GroupKey {
    const ts = startOfDay(new Date(createdAt));
    const diffDays = Math.floor((today - ts) / MS_PER_DAY);
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return 'lastSevenDays';
    return 'earlier';
}

const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'lastSevenDays', 'earlier'];

export const ChatHistory = observer(({ isOpen, onOpenChange }: ChatHistoryProps) => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handlePopoverOpenChange = (open: boolean) => {
        if (!showDeleteDialog) {
            onOpenChange(open);
        }
    };

    const handleDeleteConversation = async () => {
        if (!conversationToDelete || isDeleting) return;
        setIsDeleting(true);
        try {
            await editorEngine.chat.conversation.deleteConversation(conversationToDelete);
            setShowDeleteDialog(false);
            setConversationToDelete(null);
        } catch {
            toast.error(
                t(transKeys.editor.panels.edit.tabs.chat.history.deleteDialog.deleteFailed),
            );
        } finally {
            setIsDeleting(false);
        }
    };

    const groupLabel: Record<GroupKey, string> = {
        today: t(transKeys.editor.panels.edit.tabs.chat.history.groupToday),
        yesterday: t(transKeys.editor.panels.edit.tabs.chat.history.groupYesterday),
        lastSevenDays: t(transKeys.editor.panels.edit.tabs.chat.history.groupLastSevenDays),
        earlier: t(transKeys.editor.panels.edit.tabs.chat.history.groupEarlier),
    };

    const today = startOfDay(new Date());
    const sortedConversations = [...editorEngine.chat.conversation.conversations].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const buckets: Record<GroupKey, typeof sortedConversations> = {
        today: [],
        yesterday: [],
        lastSevenDays: [],
        earlier: [],
    };
    for (const conversation of sortedConversations) {
        buckets[groupForDate(conversation.createdAt, today)].push(conversation);
    }
    const groupedConversations = GROUP_ORDER.map((key) => ({
        key,
        items: buckets[key],
    })).filter((group) => group.items.length > 0);

    return (
        <Popover open={isOpen} onOpenChange={handlePopoverOpenChange}>
            <PopoverAnchor className="absolute top-0 -left-2" />
            <PopoverContent side="left" align="start" className="rounded-xl p-0">
                <div className="flex flex-col select-none">
                    <div className="border-b">
                        <div className="text-foreground-tertiary text-mini flex h-fit flex-row items-center justify-between p-1">
                            <span className="px-2">
                                {t(transKeys.editor.panels.edit.tabs.chat.history.title)}
                            </span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={'ghost'}
                                        size={'icon'}
                                        aria-label={t(
                                            transKeys.editor.panels.edit.tabs.chat.history.close,
                                        )}
                                        className="w-fit p-2 hover:bg-transparent"
                                        onClick={() => onOpenChange(false)}
                                    >
                                        <Icons.CrossL />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" hideArrow>
                                    {t(transKeys.editor.panels.edit.tabs.chat.history.close)}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                    <div className="text-foreground-tertiary flex flex-col gap-2 p-2">
                        <div className="flex flex-col">
                            {groupedConversations.map((group) => (
                                <div className="flex flex-col gap-1" key={group.key}>
                                    <span className="px-2 text-[0.7rem]">
                                        {groupLabel[group.key]}
                                    </span>
                                    <div className="flex flex-col">
                                        {group.items.map((conversation) => {
                                            const isCurrent =
                                                conversation.id ===
                                                editorEngine.chat.conversation.current?.id;
                                            const select = () => {
                                                void editorEngine.chat.conversation.selectConversation(
                                                    conversation.id,
                                                );
                                            };
                                            return (
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-current={isCurrent || undefined}
                                                    className={cn(
                                                        'hover:bg-background-weblab focus-visible:ring-foreground/40 group relative flex w-full min-w-0 cursor-pointer flex-row items-center rounded-md py-2 select-none focus:outline-none focus-visible:ring-2',
                                                        isCurrent &&
                                                            'bg-background-weblab text-primary font-semibold',
                                                    )}
                                                    key={conversation.id}
                                                    onClick={select}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            select();
                                                        }
                                                    }}
                                                >
                                                    <Icons.ChatBubble className="mx-2 flex-none" />
                                                    <span
                                                        className="text-mini min-w-0 flex-1 truncate pr-10 text-left"
                                                        title={conversation.title ?? undefined}
                                                    >
                                                        {conversation.title ??
                                                            t(
                                                                transKeys.editor.panels.edit.tabs
                                                                    .chat.history
                                                                    .newConversationFallback,
                                                            )}
                                                    </span>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant={'ghost'}
                                                                size={'icon'}
                                                                aria-label={t(
                                                                    transKeys.editor.panels.edit
                                                                        .tabs.chat.history
                                                                        .deleteConversationTooltip,
                                                                )}
                                                                className="group-hover:bg-background-primary hover:bg-background-tertiary absolute top-1/2 right-0 z-10 h-fit w-fit -translate-y-1/2 px-2.5 py-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setConversationToDelete(
                                                                        conversation.id,
                                                                    );
                                                                    setShowDeleteDialog(true);
                                                                }}
                                                                onKeyDown={(e) =>
                                                                    e.stopPropagation()
                                                                }
                                                            >
                                                                <Icons.Trash className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right">
                                                            <p className="font-normal">
                                                                {t(
                                                                    transKeys.editor.panels.edit
                                                                        .tabs.chat.history
                                                                        .deleteConversationTooltip,
                                                                )}
                                                            </p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(transKeys.editor.panels.edit.tabs.chat.history.deleteDialog.title)}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                transKeys.editor.panels.edit.tabs.chat.history.deleteDialog
                                    .description,
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                            {t(transKeys.editor.panels.edit.tabs.chat.history.deleteDialog.cancel)}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-small rounded-md"
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDeleteConversation();
                            }}
                        >
                            {isDeleting ? (
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {t(transKeys.editor.panels.edit.tabs.chat.history.deleteDialog.delete)}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Popover>
    );
});
