import { useTranslations } from 'next-intl';

import { cn } from '@weblab/ui/utils';

export type SkillScopeLabel = 'built-in' | 'global' | 'project';

const STYLES: Record<SkillScopeLabel, string> = {
    'built-in': 'bg-muted text-foreground-tertiary border-border',
    global: 'bg-background-success/40 text-foreground-success border-success',
    project: 'bg-background-warning/40 text-foreground-warning border-warning',
};

export function ScopeBadge({ scope, className }: { scope: SkillScopeLabel; className?: string }) {
    const t = useTranslations('settings.skills');
    const TEXT: Record<SkillScopeLabel, string> = {
        'built-in': t('badgeBuiltIn'),
        global: t('badgeGlobal'),
        project: t('badgeProject'),
    };
    return (
        <span
            className={cn(
                'text-mini inline-flex items-center rounded-md border px-1.5 py-0.5 font-medium',
                STYLES[scope],
                className,
            )}
        >
            {TEXT[scope]}
        </span>
    );
}
