'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { isLocalhostClient, writeOverridesToSource } from '../actions';
import { useEditMode, useOverrides } from './overrides-context';

export function ControlBar() {
    const { overrides, radiusScale, transitionSpeed, isDirty, save, discard, resetAll } =
        useOverrides();
    const { editMode, toggle } = useEditMode();
    const [exportOpen, setExportOpen] = useState(false);
    const [applyOpen, setApplyOpen] = useState(false);
    const [applyMessage, setApplyMessage] = useState<string | null>(null);
    const [applyError, setApplyError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isLocalhost, setIsLocalhost] = useState(false);

    useEffect(() => {
        void isLocalhostClient().then(setIsLocalhost);
    }, []);

    const totalEdited = Object.keys(overrides).length;

    const cssBlock = useMemo(
        () => buildCssBlock(overrides, radiusScale, transitionSpeed),
        [overrides, radiusScale, transitionSpeed],
    );

    const handleApply = () => {
        setApplyError(null);
        setApplyMessage(null);
        startTransition(async () => {
            const res = await writeOverridesToSource({
                overrides,
                radiusScale,
                transitionSpeed,
            });
            if (res.ok) {
                setApplyMessage(`Wrote ${res.tokenCount} tokens to globals.css`);
                save();
            } else {
                setApplyError(res.error);
            }
        });
    };

    return (
        <>
            <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/90 px-3 py-2 shadow-xl backdrop-blur-md">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={toggle}
                            className={cn(
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                editMode
                                    ? 'bg-amber-400/15 text-amber-300'
                                    : 'text-foreground-secondary hover:text-foreground hover:bg-white/5',
                            )}
                        >
                            <Icons.Pencil className="h-3.5 w-3.5" />
                            {editMode ? 'Editing' : 'Edit mode'}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        Toggle the inspector buttons on each section
                    </TooltipContent>
                </Tooltip>

                {totalEdited > 0 && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        {totalEdited} custom
                    </span>
                )}

                <div className="h-5 w-px bg-white/10" />

                <button
                    onClick={() => setExportOpen(true)}
                    disabled={totalEdited === 0}
                    className="text-foreground-secondary hover:text-foreground rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                >
                    Export
                </button>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => setApplyOpen(true)}
                            disabled={!isLocalhost || totalEdited === 0}
                            className="text-foreground-secondary hover:text-foreground rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            Apply to source
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        {isLocalhost
                            ? 'Write the overrides into packages/ui/src/globals.css'
                            : 'Only available on localhost'}
                    </TooltipContent>
                </Tooltip>

                {totalEdited > 0 && (
                    <button
                        onClick={resetAll}
                        className="text-foreground-tertiary hover:text-foreground rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
                    >
                        Reset
                    </button>
                )}

                {isDirty && (
                    <>
                        <div className="h-5 w-px bg-white/10" />
                        <span className="text-foreground-secondary text-xs">Unsaved</span>
                        <button
                            onClick={discard}
                            className="text-foreground-tertiary hover:text-foreground rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/5"
                        >
                            Discard
                        </button>
                        <button
                            onClick={save}
                            className="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                            Save
                        </button>
                    </>
                )}
            </div>

            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Export overrides</DialogTitle>
                        <DialogDescription>
                            Paste this into <code>packages/ui/src/globals.css</code> to make the
                            changes permanent.
                        </DialogDescription>
                    </DialogHeader>
                    <CopyableCss css={cssBlock} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExportOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={applyOpen}
                onOpenChange={(o) => {
                    setApplyOpen(o);
                    if (!o) {
                        setApplyError(null);
                        setApplyMessage(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Apply overrides to source</DialogTitle>
                        <DialogDescription>
                            This will write the current token overrides into a managed block in{' '}
                            <code>packages/ui/src/globals.css</code>. The change is local to your
                            checkout; commit it to share.
                        </DialogDescription>
                    </DialogHeader>
                    <pre className="bg-background-secondary border-border max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
                        <code>{cssBlock}</code>
                    </pre>
                    {applyError && <p className="text-destructive text-xs">{applyError}</p>}
                    {applyMessage && (
                        <p className="text-foreground-success text-xs">{applyMessage}</p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApplyOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleApply} disabled={isPending}>
                            {isPending ? 'Writing…' : 'Write to globals.css'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function CopyableCss({ css }: { css: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(css);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // noop
        }
    };
    return (
        <div className="space-y-2">
            <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                        <>
                            <Icons.CheckCircled className="mr-1 h-3.5 w-3.5" /> Copied
                        </>
                    ) : (
                        <>
                            <Icons.Copy className="mr-1 h-3.5 w-3.5" /> Copy CSS
                        </>
                    )}
                </Button>
            </div>
            <pre className="bg-background-secondary border-border max-h-80 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
                <code>{css}</code>
            </pre>
        </div>
    );
}

function buildCssBlock(
    overrides: Record<string, string>,
    radiusScale: number,
    transitionSpeed: number,
) {
    const lines: string[] = [];
    if (radiusScale !== 1) lines.push(`    --radius: ${radiusScale}rem;`);
    if (transitionSpeed !== 1)
        lines.push(`    --ds-anim-duration: ${Math.round(transitionSpeed * 200)}ms;`);
    Object.entries(overrides).forEach(([k, v]) => lines.push(`    ${k}: ${v};`));
    if (lines.length === 0) return '/* No overrides */';
    return [
        '/* === design-system overrides (managed) === */',
        ':root {',
        ...lines,
        '}',
        '/* === end overrides === */',
    ].join('\n');
}
