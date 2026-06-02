import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

// Upsell, not a warning — neutral/monochrome surface keeps the modal calm and
// reserves color for the single clear call to action.
export const UpgradePrompt = ({ onClick }: { onClick: () => void }) => {
    const t = useTranslations();
    return (
        <div className="border-border-secondary bg-background-secondary flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex flex-col gap-0.5">
                <p className="text-regularPlus text-foreground">
                    {t('settings.domain.upgrade.title')}
                </p>
                <p className="text-small text-foreground-secondary">
                    {t('settings.domain.upgrade.description', { app: APP_NAME })}
                </p>
            </div>
            <Button size="sm" onClick={onClick} className="shrink-0">
                {t('settings.domain.upgrade.cta')}
            </Button>
        </div>
    );
};
