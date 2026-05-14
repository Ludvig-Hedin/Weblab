import React from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { AiChatInteractive } from '../../shared/mockups/ai-chat-interactive';

export function AiChatPreviewBlock() {
    const t = useTranslations('landing.benefits.aiContext');
    return (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16">
            <div className="w-full">
                <AiChatInteractive />
            </div>
            <div className="flex flex-col gap-4">
                <div>
                    <Icons.Sparkles className="text-foreground-primary h-6 w-6" />
                </div>
                <span className="text-foreground-primary text-largePlus font-light">
                    {t('eyebrow')}
                </span>
                <p className="text-foreground-secondary text-regular">{t('body')}</p>
            </div>
        </div>
    );
}
