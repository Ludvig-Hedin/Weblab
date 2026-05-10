import { cn } from '@weblab/ui/utils';

export type SkillScopeLabel = 'built-in' | 'global' | 'project';

const STYLES: Record<SkillScopeLabel, string> = {
    'built-in': 'bg-muted text-foreground-tertiary border-border',
    global: 'bg-background-success/40 text-foreground-success border-success',
    project: 'bg-background-warning/40 text-foreground-warning border-warning',
};

const TEXT: Record<SkillScopeLabel, string> = {
    'built-in': 'Built-in',
    global: 'Global',
    project: 'This project',
};

export function ScopeBadge({ scope, className }: { scope: SkillScopeLabel; className?: string }) {
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
