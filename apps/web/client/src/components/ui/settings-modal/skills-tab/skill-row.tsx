import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import type { SkillScopeLabel } from './scope-badge';
import { ScopeBadge } from './scope-badge';

export interface SkillRowItem {
    /** DB id when scope !== 'built-in', undefined for built-ins. */
    id?: string;
    name: string;
    description: string;
    scope: SkillScopeLabel;
}

export function SkillRow({
    skill,
    onEdit,
    onDelete,
}: {
    skill: SkillRowItem;
    onEdit?: (skill: SkillRowItem) => void;
    onDelete?: (skill: SkillRowItem) => void;
}) {
    const t = useTranslations('settings.skills');
    const isBuiltIn = skill.scope === 'built-in';
    return (
        <div className="border-border/40 hover:border-border bg-background-secondary/40 group flex items-start gap-3 rounded-md border p-3 transition-colors">
            <Icons.Sparkles className="text-muted-foreground mt-1 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-foreground text-small truncate font-medium">
                        {skill.name}
                    </span>
                    <ScopeBadge scope={skill.scope} />
                </div>
                {skill.description ? (
                    <p className="text-muted-foreground text-mini mt-0.5 line-clamp-2">
                        {skill.description}
                    </p>
                ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {isBuiltIn ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                disabled
                                className="h-7 w-7"
                                aria-label={t('rowBuiltIn')}
                            >
                                <Icons.LockClosed className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            {t('rowBuiltInTooltip')}
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onEdit?.(skill)}
                            aria-label={t('rowEdit')}
                        >
                            <Icons.Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive h-7 w-7"
                            onClick={() => onDelete?.(skill)}
                            aria-label={t('rowDelete')}
                        >
                            <Icons.Trash className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
