'use client';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { COMPONENT_TOKENS } from './inspector/component-tokens';
import { useEditMode, useInspector, useRepoRoot } from './overrides-context';

interface SectionProps {
    title: string;
    tag?: string;
    filePath?: string;
    inspectId?: string;
    children: React.ReactNode;
    controls?: React.ReactNode;
    className?: string;
    editedCount?: number;
    id?: string;
}

export function Section({
    title,
    tag,
    filePath,
    inspectId,
    children,
    controls,
    className,
    editedCount,
    id,
}: SectionProps) {
    const { editMode } = useEditMode();
    const { open } = useInspector();
    const repoRoot = useRepoRoot();
    const absPath = filePath ? (repoRoot ? `${repoRoot}/${filePath}` : filePath) : null;
    const editUrl = absPath ? `cursor://file/${absPath}` : undefined;
    const sectionId = id ?? title.toLowerCase().replace(/\s+/g, '-');
    const canInspect = inspectId && COMPONENT_TOKENS[inspectId];

    return (
        <section className={cn('mb-12 scroll-mt-20', className)} id={sectionId}>
            <div className="group/section mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {tag && (
                        <span className="bg-foreground/8 text-foreground-tertiary rounded px-1.5 py-0.5 text-tiny font-medium">
                            {tag}
                        </span>
                    )}
                    <h2 className="text-foreground text-sm font-medium">{title}</h2>
                    {editedCount !== undefined && editedCount > 0 && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-tiny font-medium text-amber-400">
                            {editedCount} edited
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {controls}
                    {canInspect && editMode && (
                        <button
                            onClick={() => open(inspectId)}
                            className="border-border text-foreground hover:bg-foreground/5 flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors"
                            title="Open inspector"
                        >
                            <Icons.MixerHorizontal className="h-3 w-3" />
                            Inspect
                        </button>
                    )}
                    {editUrl && (
                        <a
                            href={editUrl}
                            className="border-border text-foreground-tertiary hover:border-foreground/40 hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-tiny transition-colors"
                            title={absPath ?? filePath}
                        >
                            <Icons.ExternalLink className="h-3 w-3" />
                            Open
                        </a>
                    )}
                </div>
            </div>
            <div>{children}</div>
        </section>
    );
}
