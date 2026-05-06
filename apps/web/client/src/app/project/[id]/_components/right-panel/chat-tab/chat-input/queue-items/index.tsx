'use client';

import { useState } from 'react';

import { type QueuedMessage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';

import { QueuedMessageItem } from './queue-item';

export const QueueItems = ({
    queuedMessages: messages,
    removeFromQueue,
}: {
    queuedMessages: QueuedMessage[];
    removeFromQueue: (id: string) => void;
}) => {
    const [queueExpanded, setQueueExpanded] = useState(false);
    if (messages.length === 0) return null;
    return (
        <Collapsible className="mb-2" open={queueExpanded} onOpenChange={setQueueExpanded}>
            <CollapsibleTrigger asChild>
                <Button
                    variant="ghost"
                    className="text-muted-foreground h-auto w-full justify-start p-2 hover:bg-transparent"
                >
                    <div className="flex items-center gap-2">
                        <Icons.ChevronDown
                            className={`size-4 transition-transform ${queueExpanded ? 'rotate-180' : ''}`}
                        />
                        <span className="text-xs">{messages.length} chats in queue</span>
                    </div>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-1 flex flex-col gap-0">
                    {messages.map((message, index) => (
                        <QueuedMessageItem
                            key={message.id}
                            message={message}
                            index={index}
                            removeFromQueue={removeFromQueue}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};
