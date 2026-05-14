'use client';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useRepoRoot } from './overrides-context';

interface GroupHeaderProps {
    id: string;
    title: string;
    description?: string;
    filePath?: string;
    /** Optional eyebrow label rendered above the title (e.g. "Tokens", "Forms"). */
    eyebrow?: string;
    className?: string;
}

export function GroupHeader({
    id,
    title,
    description,
    filePath,
    eyebrow,
    className,
}: GroupHeaderProps) {
    const repoRoot = useRepoRoot();
    const absPath = filePath ? (repoRoot ? `${repoRoot}/${filePath}` : filePath) : null;

    return (
        <div id={id} className={cn('mb-8 scroll-mt-24', className)}>
            <div className="border-border flex flex-wrap items-end justify-between gap-4 border-b pb-4">
                <div className="min-w-0">
                    {eyebrow && (
                        <p className="text-foreground-tertiary mb-2 font-mono text-[10px]">
                            {eyebrow}
                        </p>
                    )}
                    <h1 className="text-foreground text-3xl font-light tracking-tight sm:text-4xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-foreground-secondary mt-2 max-w-2xl text-sm leading-relaxed">
                            {description}
                        </p>
                    )}
                </div>
                {filePath && (
                    <a
                        href={`cursor://file/${absPath}`}
                        className="border-border text-foreground-secondary hover:border-foreground/40 hover:text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors"
                        title={absPath ?? filePath}
                    >
                        <Icons.ExternalLink className="h-3 w-3" />
                        Open in Editor
                    </a>
                )}
            </div>
        </div>
    );
}
