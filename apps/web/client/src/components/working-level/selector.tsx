'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import type { WorkingLevel } from '@/lib/working-level';

export function WorkingLevelSelector({ level, onChange, disabled = false, nextOpen = false, sessionOnly = false, variant = 'settings' }: {
    level: WorkingLevel | null;
    onChange: (level: WorkingLevel) => void;
    disabled?: boolean;
    nextOpen?: boolean;
    sessionOnly?: boolean;
    variant?: 'settings' | 'onboarding';
}) {
    const t = useTranslations('workingLevel');
    const onboarding = variant === 'onboarding';
    return <div className="space-y-3">
        <div className={onboarding ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2'} role="group" aria-label={t('title')}>
            {(['content', 'full'] as const).map((value) => {
                const Icon = value === 'content' ? Icons.Pencil : Icons.Code;
                return <Button key={value} type="button" variant={level === value ? 'secondary' : 'outline'}
                    className={cn('h-auto w-full justify-start whitespace-normal text-left focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        onboarding ? 'min-h-52 flex-col items-start gap-5 p-6' : 'gap-3 p-3')}
                    disabled={disabled} aria-pressed={level === value} onClick={() => onChange(value)}>
                    <Icon aria-hidden="true" className={onboarding ? 'text-foreground-secondary size-6' : 'text-foreground-secondary size-4'} />
                    <span className={onboarding ? 'space-y-2' : 'space-y-1'}>
                        <span className={cn('block font-medium', onboarding && 'text-xl')}>{t(value)}</span>
                        {onboarding && <span className="text-foreground block text-regular font-normal">{t(value === 'content' ? 'contentAudience' : 'fullAudience')}</span>}
                        <span className="text-foreground-secondary block text-small font-normal">{t(value === 'content' ? 'contentDescription' : 'fullDescription')}</span>
                    </span>
                </Button>;
            })}
        </div>
        {nextOpen && <p className="text-foreground-secondary text-small">{t('nextOpen')}</p>}
        {sessionOnly && <p role="status" className="text-foreground-secondary text-small">{t('sessionOnly')}</p>}
    </div>;
}
