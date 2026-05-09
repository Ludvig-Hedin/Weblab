import { cn } from '@weblab/ui/utils';

export type SkillScopeLabel = 'built-in' | 'global' | 'project';

const STYLES: Record<SkillScopeLabel, string> = {
    'built-in': 'bg-muted text-muted-foreground border-border/40',
    global: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    project: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
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
