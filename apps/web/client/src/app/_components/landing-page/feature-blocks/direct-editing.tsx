import React from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { DirectEditingInteractive } from '../../shared/mockups/direct-editing-interactive';

export function DirectEditingBlock() {
    const t = useTranslations('landing.benefits.canvas');
    return (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16">
            <DirectEditingInteractive />
            <div className="flex flex-col gap-4">
                <div>
                    <Icons.DirectManipulation className="text-foreground-primary h-6 w-6" />
                </div>
                <span className="text-foreground-primary text-largePlus font-light">
                    {t('eyebrow')}
                </span>
                <p className="text-foreground-secondary text-regular">{t('body')}</p>
            </div>
        </div>
    );
}
