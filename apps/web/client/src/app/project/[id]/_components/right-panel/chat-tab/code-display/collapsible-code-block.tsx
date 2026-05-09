'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import { CodeBlock } from '@weblab/ui/ai-elements';
import { Button } from '@weblab/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { cn, getTruncatedFileName } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

interface CollapsibleCodeBlockProps {
    path: string;
    content: string;
    messageId: string;
    applied: boolean;
    isStream?: boolean;
    branchId?: string;
    /** When true, show an "Apply" button that writes the file content to disk. */
    showApply?: boolean;
}

const MAX_STREAMING_PREVIEW_CHARS = 12000;
const MAX_STREAMING_PREVIEW_LINES = 250;

function getStreamingPreview(content: string) {
    const lines = content.split('\n');
    const truncatedByLines = lines.length > MAX_STREAMING_PREVIEW_LINES;
    const previewByLines = truncatedByLines
        ? lines.slice(0, MAX_STREAMING_PREVIEW_LINES).join('\n')
        : content;

    const truncatedByChars = previewByLines.length > MAX_STREAMING_PREVIEW_CHARS;
    const preview = truncatedByChars
        ? previewByLines.slice(0, MAX_STREAMING_PREVIEW_CHARS)
        : previewByLines;

    return {
        preview,
        truncated: truncatedByLines || truncatedByChars,
    };
}

const CollapsibleCodeBlockComponent = ({
    path,
    content,
    isStream,
    branchId,
    showApply,
}: CollapsibleCodeBlockProps) => {
    const editorEngine = useEditorEngine();
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applyDone, setApplyDone] = useState(false);
    const { preview, truncated } = useMemo(() => getStreamingPreview(content), [content]);

    useEffect(() => {
        if (isStream) {
            setIsOpen(true);
        }
    }, [isStream]);

    const copyToClipboard = () => {
        void navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const applyFile = async () => {
        setApplying(true);
        try {
            await editorEngine.activeSandbox?.writeFile(path, content);
            setApplyDone(true);
            setTimeout(() => setApplyDone(false), 2500);
        } catch (e) {
            console.error('Failed to apply file:', e);
        } finally {
            setApplying(false);
        }
    };

    const getAnimation = () => {
        return isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 };
    };

    const branch = branchId
        ? editorEngine.branches.allBranches.find((b) => b.id === branchId)
        : editorEngine.branches.activeBranch;

    return (
        <div className="group relative my-3">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div
                    className={cn(
                        'bg-background-primary relative rounded-lg border',
                        !isOpen && 'group-hover:bg-background-secondary',
                    )}
                >
                    <div
                        className={cn(
                            'text-foreground-secondary flex items-center justify-between',
                            !isOpen && 'group-hover:text-foreground-primary',
                        )}
                    >
                        <CollapsibleTrigger asChild>
                            <div className="flex flex-1 cursor-pointer items-center gap-2 py-2 pl-3">
                                {isStream ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.ChevronDown
                                        className={cn(
                                            'h-4 w-4 transition-transform duration-200',
                                            isOpen && 'rotate-180',
                                        )}
                                    />
                                )}
                                <div
                                    className={cn(
                                        'text-small pointer-events-none flex min-w-0 items-center overflow-hidden select-none',
                                        isStream && 'text-shimmer',
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">
                                        {getTruncatedFileName(path)}
                                    </span>
                                    {branch && (
                                        <span className="text-foreground-tertiary group-hover:text-foreground-secondary text-mini ml-0.5 max-w-24 flex-shrink-0 truncate">
                                            {' • '}
                                            {branch.name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent forceMount>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key="content"
                                initial={getAnimation()}
                                animate={getAnimation()}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                style={{ overflow: 'hidden' }}
                            >
                                {/* Render streaming code immediately so users can follow file writes live. */}
                                {(isOpen || isStream) && (
                                    <div className="border-t">
                                        <CodeBlock
                                            code={isStream ? preview : content}
                                            language="jsx"
                                            isStreaming={isStream}
                                            className="text-mini overflow-x-auto"
                                        />
                                        {isStream && truncated && (
                                            <div className="text-foreground-tertiary text-mini border-t px-3 py-2">
                                                Showing a live preview while the file is being
                                                written. Expand after the tool finishes to inspect
                                                the full content.
                                            </div>
                                        )}
                                        <div className="flex items-center justify-end gap-1.5 border-t p-1">
                                            {showApply && !isStream && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-foreground-secondary hover:text-foreground h-7 px-2 font-sans select-none"
                                                    onClick={() => void applyFile()}
                                                    disabled={applying}
                                                >
                                                    {applying ? (
                                                        <>
                                                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                                            Applying…
                                                        </>
                                                    ) : applyDone ? (
                                                        <>
                                                            <Icons.Check className="mr-2 h-4 w-4" />
                                                            Applied
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Icons.Play className="mr-2 h-4 w-4" />
                                                            Apply
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-foreground-secondary hover:text-foreground h-7 px-2 font-sans select-none"
                                                onClick={copyToClipboard}
                                            >
                                                {copied ? (
                                                    <>
                                                        <Icons.Check className="mr-2 h-4 w-4" />
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Icons.Copy className="mr-2 h-4 w-4" />
                                                        Copy
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </CollapsibleContent>
                </div>
            </Collapsible>
        </div>
    );
};

export const CollapsibleCodeBlock = memo(observer(CollapsibleCodeBlockComponent));
