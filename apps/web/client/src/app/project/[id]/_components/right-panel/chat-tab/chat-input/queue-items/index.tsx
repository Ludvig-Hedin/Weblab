'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { type QueuedMessage } from '@weblab/models';

import { transKeys } from '@/i18n/keys';
import { QueuedMessageItem } from './queue-item';

interface QueueItemsProps {
    queuedMessages: QueuedMessage[];
    removeFromQueue: (id: string) => void;
    editQueuedMessage: (id: string, content: string) => void;
    moveQueuedMessage: (id: string, direction: 'up' | 'down') => void;
    reorderQueuedMessages: (sourceId: string, targetId: string) => void;
}

export const QueueItems = ({
    queuedMessages,
    removeFromQueue,
    editQueuedMessage,
    moveQueuedMessage,
    reorderQueuedMessages,
}: QueueItemsProps) => {
    const t = useTranslations();
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    if (queuedMessages.length === 0) return null;

    return (
        <div className="border-border bg-background-tertiary/40 mx-2 mb-2 overflow-hidden rounded-md border">
            <div className="text-mini text-foreground-tertiary px-3 pt-2 pb-1 select-none">
                {t(transKeys.editor.panels.edit.tabs.chat.queue.header, {
                    count: String(queuedMessages.length),
                })}
            </div>
            <ul className="flex flex-col">
                {queuedMessages.map((message, index) => (
                    <QueuedMessageItem
                        key={message.id}
                        message={message}
                        index={index}
                        total={queuedMessages.length}
                        isDragging={draggingId === message.id}
                        isDragOver={dragOverId === message.id && draggingId !== message.id}
                        onDragStart={() => {
                            setDraggingId(message.id);
                            setDragOverId(null);
                        }}
                        onDragOver={() => setDragOverId(message.id)}
                        onDragLeave={() => {
                            setDragOverId((prev) => (prev === message.id ? null : prev));
                        }}
                        onDrop={(sourceId) => {
                            reorderQueuedMessages(sourceId, message.id);
                            setDraggingId(null);
                            setDragOverId(null);
                        }}
                        onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverId(null);
                        }}
                        removeFromQueue={removeFromQueue}
                        editQueuedMessage={editQueuedMessage}
                        moveQueuedMessage={moveQueuedMessage}
                    />
                ))}
            </ul>
        </div>
    );
};
