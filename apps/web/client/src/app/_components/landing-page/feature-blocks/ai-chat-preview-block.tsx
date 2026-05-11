import React from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { AiChatInteractive } from '../../shared/mockups/ai-chat-interactive';

export function AiChatPreviewBlock() {
    const t = useTranslations('landing.benefits.aiContext');
    return (
        <div className="flex w-full flex-col gap-6">
            <AiChatInteractive />
            <div className="flex w-full flex-row items-start gap-8">
                <div className="flex w-1/2 flex-col items-start">
                    <div className="mb-2">
                        <Icons.Sparkles className="text-foreground-primary h-6 w-6" />
                    </div>
                    <span className="text-foreground-primary text-largePlus font-light">
                        {t('eyebrow')}
                    </span>
                </div>
                <p className="text-foreground-secondary text-regular w-1/2 text-balance">
                    {t('body')}
                </p>
            </div>
        </div>
    );
}
