'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { transKeys } from '@/i18n/keys';

export function NoSelectionEmptyState() {
    const t = useTranslations();
    return (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Icons.CursorArrow className="text-foreground-tertiary h-8 w-8" />
            <p className="text-foreground-primary text-small font-medium">
                {t(transKeys.editor.panels.edit.tabs.interactions.empty.noSelection.title)}
            </p>
            <p className="text-foreground-tertiary text-mini">
                {t(transKeys.editor.panels.edit.tabs.interactions.empty.noSelection.body)}
            </p>
        </div>
    );
}
