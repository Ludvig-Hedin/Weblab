import React, { memo, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { ChatMessage, GitMessageCheckpoint } from '@weblab/models';
import { ChatType, MessageCheckpointType } from '@weblab/models';
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
import { Checkbox } from '@weblab/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { EditMessage } from '@/app/project/[id]/_hooks/use-chat';
import { useEditorEngine } from '@/components/store/editor';
import { restoreCheckpoint } from '@/components/store/editor/git';
import { transKeys } from '@/i18n/keys';
import { SentContextPill } from '../context-pills/sent-context-pill';
import { MessageContent } from './message-content';
import { MultiBranchRevertModal } from './multi-branch-revert-modal';
import { useSkipRestoreConfirm } from './use-skip-restore-confirm';

type PendingRestore =
    | { kind: 'single'; checkpoint: GitMessageCheckpoint }
    | { kind: 'legacy' }
    | null;

interface UserMessageProps {
    onEditMessage: EditMessage;
    message: ChatMessage;
}

export const getUserMessageContent = (message: ChatMessage) => {
    return message.parts
        .map((part) => {
            if (part.type === 'text') {
                return part.text;
            }
            return '';
        })
        .join('');
};

const UserMessageComponent = ({ onEditMessage, message }: UserMessageProps) => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const [isCopied, setIsCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const [isMultiBranchModalOpen, setIsMultiBranchModalOpen] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<PendingRestore>(null);
    const [skipRestoreConfirm, setSkipRestoreConfirm] = useSkipRestoreConfirm();
    const [skipNextTime, setSkipNextTime] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const gitCheckpoints =
        message.metadata?.checkpoints?.filter((s) => s.type === MessageCheckpointType.GIT) ?? [];

    // Legacy checkpoints (created before multi-branch support) don't have branchId.
    // If any exist, fall back to simple single-branch restore UI.
    const hasLegacyCheckpoints = gitCheckpoints.some((cp) => !cp.branchId);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            if (editValue === getUserMessageContent(message)) {
                textareaRef.current.setSelectionRange(editValue.length, editValue.length);
            }
        }
    }, [isEditing]);

    const handleEditClick = () => {
        setEditValue(getUserMessageContent(message));
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            void handleSubmit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    async function handleCopyClick() {
        const text = getUserMessageContent(message);
        await navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    }

    const handleSubmit = async () => {
        if (isSubmittingEdit) return;
        setIsSubmittingEdit(true);
        setIsEditing(false);
        try {
            await sendMessage(editValue);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const handleRetry = async () => {
        if (isRetrying) return;
        setIsRetrying(true);
        const promise = onEditMessage(message.id, getUserMessageContent(message), ChatType.EDIT);
        toast.promise(promise, { error: 'Failed to resubmit message' });
        try {
            await promise;
        } catch {
            // toast.promise already surfaces the error to the user.
        } finally {
            setIsRetrying(false);
        }
    };

    const sendMessage = async (newContent: string) => {
        toast.promise(onEditMessage(message.id, newContent, ChatType.EDIT), {
            loading: 'Editing message...',
            success: 'Message resubmitted successfully',
            error: 'Failed to resubmit message',
        });
    };

    const performRestore = async (checkpoint: GitMessageCheckpoint) => {
        setIsRestoring(true);
        try {
            await restoreCheckpoint(checkpoint, editorEngine);
        } finally {
            setIsRestoring(false);
        }
    };

    const requestRestoreSingleBranch = (checkpoint: GitMessageCheckpoint) => {
        if (skipRestoreConfirm) {
            void performRestore(checkpoint);
            return;
        }
        setSkipNextTime(false);
        setPendingRestore({ kind: 'single', checkpoint });
    };

    const requestRestoreLegacy = () => {
        const firstCheckpoint = gitCheckpoints[0];
        if (!firstCheckpoint) return;
        if (skipRestoreConfirm) {
            void performRestore(firstCheckpoint);
            return;
        }
        setSkipNextTime(false);
        setPendingRestore({ kind: 'legacy' });
    };

    const confirmRestore = async () => {
        if (!pendingRestore) return;
        if (skipNextTime) setSkipRestoreConfirm(true);
        const checkpoint =
            pendingRestore.kind === 'legacy' ? gitCheckpoints[0] : pendingRestore.checkpoint;
        setPendingRestore(null);
        if (!checkpoint) return;
        await performRestore(checkpoint);
    };

    const getBranchName = (branchId: string | undefined): string => {
        if (!branchId) {
            return editorEngine.branches.activeBranch.name;
        }
        const branch = editorEngine.branches.getBranchById(branchId);
        return branch?.name || branchId;
    };

    function renderEditingInput() {
        return (
            <div className="flex flex-col">
                <Textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="text-small mt-[-8px] resize-none border-none px-0"
                    rows={2}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={() => setIsComposing(false)}
                />
                <div className="flex justify-end gap-2">
                    <Button
                        size="sm"
                        variant={'ghost'}
                        onClick={handleCancel}
                        disabled={isSubmittingEdit}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant={'outline'}
                        onClick={handleSubmit}
                        disabled={isSubmittingEdit || editValue.trim().length === 0}
                    >
                        {isSubmittingEdit ? (
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        ) : (
                            'Submit'
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    function renderButtons() {
        return (
            <div className="flex gap-1 pr-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={handleRetry}
                            size="icon"
                            variant="ghost"
                            disabled={isRetrying}
                            aria-label={t(transKeys.editor.panels.edit.tabs.chat.userMessage.retry)}
                            className="h-6 w-6 p-1"
                        >
                            {isRetrying ? (
                                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Reload className="h-4 w-4" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={5}>
                        Retry
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={handleEditClick}
                            size="icon"
                            variant="ghost"
                            aria-label={t(transKeys.editor.panels.edit.tabs.chat.userMessage.edit)}
                            className="h-6 w-6 p-1"
                        >
                            <Icons.Pencil className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={5}>
                        Edit
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={handleCopyClick}
                            size="icon"
                            variant="ghost"
                            aria-label={t(transKeys.editor.panels.edit.tabs.chat.userMessage.copy)}
                            className="h-6 w-6 p-1"
                        >
                            {isCopied ? (
                                <Icons.Check className="text-foreground-brand h-4 w-4" />
                            ) : (
                                <Icons.Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={5}>
                        Copy
                    </TooltipContent>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="group relative flex w-full flex-row justify-end px-2" key={message.id}>
            <div className="ml-8 flex w-[90%] flex-col items-end gap-1">
                {(message.metadata?.context?.length ?? 0) > 0 && (
                    <div className="mb-2 flex w-full flex-row items-center justify-end pr-2">
                        <div className="text-foreground-secondary flex flex-row gap-3 text-xs">
                            {message.metadata?.context?.map((context, index) => (
                                <SentContextPill
                                    key={`${context.type}-${index}`}
                                    context={context}
                                />
                            ))}
                        </div>
                    </div>
                )}
                <div className="bg-background-muted relative flex flex-col rounded-xl px-3 py-2">
                    <div className="text-small leading-snug tracking-[-0.005em]">
                        {isEditing ? (
                            renderEditingInput()
                        ) : (
                            <MessageContent
                                messageId={message.id}
                                parts={message.parts}
                                applied={false}
                                isStream={false}
                            />
                        )}
                    </div>
                </div>
                {!isEditing && renderButtons()}
            </div>
            {gitCheckpoints.length > 0 && (
                <div className="absolute top-1/2 left-2 -translate-y-1/2">
                    {hasLegacyCheckpoints ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={requestRestoreLegacy}
                                    aria-label={t(
                                        transKeys.editor.panels.edit.tabs.chat.restore.ariaLabel,
                                    )}
                                    className={cn(
                                        'text-mini rounded-md p-2 opacity-0 group-hover:opacity-100 hover:opacity-80',
                                        isRestoring ? 'opacity-100' : 'opacity-0',
                                    )}
                                    disabled={isRestoring}
                                >
                                    {isRestoring ? (
                                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Icons.Reset className="h-4 w-4" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={5}>
                                {isRestoring ? 'Restoring...' : 'Restore to here'}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <>
                            <Tooltip>
                                <DropdownMenu>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={t(
                                                    transKeys.editor.panels.edit.tabs.chat.restore
                                                        .ariaLabel,
                                                )}
                                                className={cn(
                                                    'text-mini h-8 w-8 rounded-md opacity-0 group-hover:opacity-100 hover:opacity-80',
                                                    isRestoring ? 'opacity-100' : 'opacity-0',
                                                )}
                                                disabled={isRestoring}
                                            >
                                                {isRestoring ? (
                                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Icons.Reset className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={5}>
                                        {isRestoring ? 'Restoring...' : 'Restore to here'}
                                    </TooltipContent>
                                    <DropdownMenuContent align="start" side="right">
                                        <DropdownMenuLabel>Restore Branch</DropdownMenuLabel>
                                        {gitCheckpoints.map((checkpoint) => (
                                            <DropdownMenuItem
                                                key={checkpoint.branchId}
                                                onClick={() =>
                                                    requestRestoreSingleBranch(checkpoint)
                                                }
                                            >
                                                {getBranchName(checkpoint.branchId)}
                                            </DropdownMenuItem>
                                        ))}
                                        {gitCheckpoints.length > 1 && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => setIsMultiBranchModalOpen(true)}
                                                >
                                                    Select Multiple Branches...
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </Tooltip>
                            <MultiBranchRevertModal
                                open={isMultiBranchModalOpen}
                                onOpenChange={setIsMultiBranchModalOpen}
                                checkpoints={gitCheckpoints}
                            />
                        </>
                    )}
                </div>
            )}
            <AlertDialog
                open={pendingRestore !== null}
                onOpenChange={(next) => {
                    if (!next) setPendingRestore(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(transKeys.editor.panels.edit.tabs.chat.restore.confirmTitle)}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(transKeys.editor.panels.edit.tabs.chat.restore.confirmDescription)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <label className="text-foreground-secondary text-mini flex items-center gap-2">
                        <Checkbox
                            checked={skipNextTime}
                            onCheckedChange={(checked) => setSkipNextTime(checked === true)}
                        />
                        {t(transKeys.editor.panels.edit.tabs.chat.restore.dontAskAgain)}
                    </label>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t(transKeys.editor.panels.edit.tabs.chat.restore.cancel)}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => void confirmRestore()}>
                            {t(transKeys.editor.panels.edit.tabs.chat.restore.confirm)}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export const UserMessage = memo(observer(UserMessageComponent));
