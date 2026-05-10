'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { type QueuedMessage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { DragPosition } from './index';
import { transKeys } from '@/i18n/keys';

const DRAG_TYPE = 'application/x-weblab-queue-id';
// Safari + a few other browsers strip non-standard MIMEs from dataTransfer in
// some configurations. Always set both so the drop handler has a fallback.
const FALLBACK_DRAG_TYPE = 'text/plain';

interface QueuedMessageItemProps {
    message: QueuedMessage;
    index: number;
    total: number;
    isDragging: boolean;
    isDragOver: boolean;
    dragOverPosition: DragPosition;
    onDragStart: () => void;
    onDragOver: (position: DragPosition) => void;
    onDragLeave: () => void;
    onDrop: (sourceId: string, position: DragPosition) => void;
    onDragEnd: () => void;
    removeFromQueue: (id: string) => void;
    editQueuedMessage: (id: string, content: string) => void;
    moveQueuedMessage: (id: string, direction: 'up' | 'down') => void;
}

export const QueuedMessageItem = ({
    message,
    index,
    total,
    isDragging,
    isDragOver,
    dragOverPosition,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    removeFromQueue,
    editQueuedMessage,
    moveQueuedMessage,
}: QueuedMessageItemProps) => {
    const t = useTranslations();
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(message.content);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    // Tracks mounted state so blur-fired commit on a row that just got drained
    // from the queue can't call setState after unmount.
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!isEditing) setDraft(message.content);
    }, [message.content, isEditing]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    const startEdit = () => {
        if (isDragging) return;
        setDraft(message.content);
        setIsEditing(true);
    };

    const commitEdit = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== message.content) {
            editQueuedMessage(message.id, trimmed);
        }
        if (isMountedRef.current) {
            setIsEditing(false);
        }
    };

    const cancelEdit = () => {
        if (!isMountedRef.current) return;
        setDraft(message.content);
        setIsEditing(false);
    };

    const isFirst = index === 0;
    const isLast = index === total - 1;

    return (
        <li
            className={cn(
                'group relative flex items-center gap-2 px-2 py-1.5 transition-colors',
                !isEditing && 'hover:bg-background-tertiary/70',
                isDragging && 'opacity-50',
                isDragOver &&
                    dragOverPosition === 'before' &&
                    'before:bg-foreground-brand before:absolute before:inset-x-2 before:top-0 before:h-px',
                isDragOver &&
                    dragOverPosition === 'after' &&
                    'after:bg-foreground-brand after:absolute after:inset-x-2 after:bottom-0 after:h-px',
            )}
            onDragOver={(e) => {
                if (isEditing) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                onDragOver(e.clientY < midpoint ? 'before' : 'after');
            }}
            onDragLeave={onDragLeave}
            onDrop={(e) => {
                e.preventDefault();
                const sourceId =
                    e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData(FALLBACK_DRAG_TYPE);
                if (!sourceId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                onDrop(sourceId, e.clientY < midpoint ? 'before' : 'after');
            }}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label={t(transKeys.editor.panels.edit.tabs.chat.queue.drag)}
                        draggable={!isEditing}
                        onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_TYPE, message.id);
                            e.dataTransfer.setData(FALLBACK_DRAG_TYPE, message.id);
                            e.dataTransfer.effectAllowed = 'move';
                            onDragStart();
                        }}
                        onDragEnd={onDragEnd}
                        className={cn(
                            'text-foreground-tertiary hover:text-foreground-secondary flex h-6 w-4 cursor-grab items-center justify-center opacity-40 transition-opacity group-hover:opacity-100 active:cursor-grabbing',
                            isEditing && 'pointer-events-none opacity-0',
                        )}
                    >
                        <Icons.DotsVertical className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" hideArrow>
                    {t(transKeys.editor.panels.edit.tabs.chat.queue.drag)}
                </TooltipContent>
            </Tooltip>

            <Icons.ChatBubble className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />

            {isEditing ? (
                <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                        }
                    }}
                    rows={1}
                    className="text-small text-foreground-primary border-border bg-background placeholder:text-foreground-tertiary focus-visible:ring-foreground/30 [field-sizing:content] min-w-0 flex-1 resize-none rounded-sm border px-2 py-1 outline-none focus-visible:ring-1"
                />
            ) : (
                <button
                    type="button"
                    onClick={startEdit}
                    className="text-small text-foreground-secondary hover:text-foreground-primary min-w-0 flex-1 truncate text-left"
                    title={message.content}
                >
                    {message.content}
                </button>
            )}

            {!isEditing && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t(transKeys.editor.panels.edit.tabs.chat.queue.moveUp)}
                                disabled={isFirst}
                                onClick={() => moveQueuedMessage(message.id, 'up')}
                                className="text-foreground-tertiary hover:text-foreground-primary h-6 w-6"
                            >
                                <Icons.ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" hideArrow>
                            {t(transKeys.editor.panels.edit.tabs.chat.queue.moveUp)}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t(
                                    transKeys.editor.panels.edit.tabs.chat.queue.moveDown,
                                )}
                                disabled={isLast}
                                onClick={() => moveQueuedMessage(message.id, 'down')}
                                className="text-foreground-tertiary hover:text-foreground-primary h-6 w-6"
                            >
                                <Icons.ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" hideArrow>
                            {t(transKeys.editor.panels.edit.tabs.chat.queue.moveDown)}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t(transKeys.editor.panels.edit.tabs.chat.queue.edit)}
                                onClick={startEdit}
                                className="text-foreground-tertiary hover:text-foreground-primary h-6 w-6"
                            >
                                <Icons.Pencil className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" hideArrow>
                            {t(transKeys.editor.panels.edit.tabs.chat.queue.edit)}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t(transKeys.editor.panels.edit.tabs.chat.queue.remove)}
                                onClick={() => removeFromQueue(message.id)}
                                className="text-foreground-tertiary hover:text-destructive h-6 w-6"
                            >
                                <Icons.Trash className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" hideArrow>
                            {t(transKeys.editor.panels.edit.tabs.chat.queue.remove)}
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}
        </li>
    );
};
