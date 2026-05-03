import { useEditorEngine } from '@/components/store/editor';
import { CodeBlock } from '@weblab/ui/ai-elements';
import { Button } from '@weblab/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { cn, getTruncatedFileName } from '@weblab/ui/utils';
import { AnimatePresence, motion } from 'motion/react';
import { observer } from 'mobx-react-lite';
import { memo, useEffect, useMemo, useState } from 'react';

interface CollapsibleCodeBlockProps {
    path: string;
    content: string;
    messageId: string;
    applied: boolean;
    isStream?: boolean;
    branchId?: string;
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
}: CollapsibleCodeBlockProps) => {
    const editorEngine = useEditorEngine();
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const { preview, truncated } = useMemo(() => getStreamingPreview(content), [content]);

    useEffect(() => {
        if (isStream) {
            setIsOpen(true);
        }
    }, [isStream]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getAnimation = () => {
        return isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 };
    };

    const branch = branchId
        ? editorEngine.branches.allBranches.find(b => b.id === branchId)
        : editorEngine.branches.activeBranch;

    return (
        <div className="group relative my-3">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div
                    className={cn(
                        'border rounded-lg bg-background-primary relative',
                        !isOpen && 'group-hover:bg-background-secondary',
                    )}
                >
                    <div
                        className={cn(
                            'flex items-center justify-between text-foreground-secondary',
                            !isOpen && 'group-hover:text-foreground-primary',
                        )}
                    >
                        <CollapsibleTrigger asChild>
                            <div className="flex-1 flex items-center gap-2 cursor-pointer pl-3 py-2">
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
                                        'text-small pointer-events-none select-none flex items-center min-w-0 overflow-hidden',
                                        isStream && 'text-shimmer',
                                    )}
                                >
                                    <span className="truncate flex-1 min-w-0">{getTruncatedFileName(path)}</span>
                                    {branch && (
                                        <span className="text-foreground-tertiary group-hover:text-foreground-secondary text-mini ml-0.5 flex-shrink-0 truncate max-w-24">
                                            {' • '}{branch.name}
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
                                            className="text-xs overflow-x-auto"
                                        />
                                        {isStream && truncated && (
                                            <div className="border-t px-3 py-2 text-xs text-foreground-tertiary">
                                                Showing a live preview while the file is being written. Expand after the tool finishes to inspect the full content.
                                            </div>
                                        )}
                                        <div className="flex justify-end gap-1.5 p-1 border-t">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-foreground-secondary hover:text-foreground font-sans select-none"
                                                onClick={copyToClipboard}
                                            >
                                                {copied ? (
                                                    <>
                                                        <Icons.Check className="h-4 w-4 mr-2" />
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Icons.Copy className="h-4 w-4 mr-2" />
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
        </div >
    );
};

export const CollapsibleCodeBlock = memo(observer(CollapsibleCodeBlockComponent));
