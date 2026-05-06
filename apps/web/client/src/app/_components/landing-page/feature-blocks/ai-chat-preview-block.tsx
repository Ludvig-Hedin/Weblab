import React from 'react';

import { Icons } from '@weblab/ui/icons';

import { AiChatInteractive } from '../../shared/mockups/ai-chat-interactive';

export function AiChatPreviewBlock() {
    return (
        <div className="flex w-full flex-col gap-6">
            <AiChatInteractive />
            <div className="flex w-full flex-row items-start gap-8">
                <div className="flex w-1/2 flex-col items-start">
                    <div className="mb-2">
                        <Icons.Sparkles className="text-foreground-primary h-6 w-6" />
                    </div>
                    <span className="text-foreground-primary text-largePlus font-light">
                        AI That Understands Context
                    </span>
                </div>
                <p className="text-foreground-secondary text-regular w-1/2 text-balance">
                    Reference images, designs, and docs in chat. AI sees what you see — no more
                    explaining from scratch.
                </p>
            </div>
        </div>
    );
}
