'use client';

import { useTranslations } from 'next-intl';

import { transKeys } from '@/i18n/keys';

export function NoInteractionsEmptyState() {
    const t = useTranslations();
    return (
        <div className="px-3 py-4">
            <p className="text-foreground-secondary text-mini">
                {t(transKeys.editor.panels.edit.tabs.interactions.empty.noInteractions.body)}
            </p>
        </div>
    );
}
