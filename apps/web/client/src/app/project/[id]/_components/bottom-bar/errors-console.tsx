'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { ParsedError } from '@weblab/utility';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { FIX_ERRORS_EVENT } from '../right-panel/chat-tab/error';

type Severity = 'error' | 'warning' | 'log';

const WARNING_PATTERN = /\bwarn(ing)?\b|^<w>/i;
const ERROR_PATTERN =
    /\b(error|fatal|exception|failed|cannot find|reference\s*error|type\s*error|syntax\s*error|npm err!|err!)\b/i;

function classifySeverity(content: string): Severity {
    if (WARNING_PATTERN.test(content) && !ERROR_PATTERN.test(content)) return 'warning';
    if (ERROR_PATTERN.test(content)) return 'error';
    return 'log';
}

const SEVERITY_TEXT: Record<Severity, string> = {
    error: 'text-red-400',
    warning: 'text-yellow-400',
    log: 'text-foreground-secondary',
};

const SEVERITY_BORDER: Record<Severity, string> = {
    error: 'border-red-500/30',
    warning: 'border-yellow-500/30',
    log: 'border-border/60',
};

async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copied`);
    } catch (err) {
        console.error('Clipboard write failed:', err);
        toast.error('Could not copy to clipboard');
    }
}

function formatErrorForCopy(error: ParsedError): string {
    return `[${error.sourceId} • ${error.branchName}]\n${error.content}`;
}

const CopyButton = ({
    onClick,
    label,
    className,
}: {
    onClick: () => void;
    label: string;
    className?: string;
}) => {
    const [copied, setCopied] = useState(false);
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    onClick={handleClick}
                    className={cn(
                        'text-foreground-tertiary hover:text-foreground-primary inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/5',
                        className,
                    )}
                >
                    {copied ? (
                        <Icons.Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                        <Icons.Copy className="h-3.5 w-3.5" />
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={4} hideArrow>
                {copied ? 'Copied' : label}
            </TooltipContent>
        </Tooltip>
    );
};

export const ErrorsConsole = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const errors = editorEngine.branches.getAllErrors();
    const errorCount = errors.length;

    const handleFix = () => {
        // Make sure the chat is reachable so the user sees the fix-in-progress.
        if (editorEngine.state.panelsHidden) {
            editorEngine.state.togglePanelsHidden();
        }
        editorEngine.chat.requestFixErrors();
        window.dispatchEvent(new CustomEvent(FIX_ERRORS_EVENT));
    };

    const handleCopyAll = () => {
        const dump = errors.map(formatErrorForCopy).join('\n\n');
        void copyText(dump, `${errorCount} ${errorCount === 1 ? 'entry' : 'entries'}`);
    };

    return (
        <Popover>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <button
                            aria-label={
                                errorCount === 0
                                    ? t(
                                          transKeys.editor.panels.edit.tabs.chat.errors
                                              .consoleNoErrors,
                                      )
                                    : t(
                                          transKeys.editor.panels.edit.tabs.chat.errors
                                              .consoleErrors,
                                          {
                                              count: errorCount,
                                          },
                                      )
                            }
                            className={cn(
                                'relative flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-all duration-150',
                                errorCount > 0
                                    ? 'hover:bg-background-bar-active text-red-400 hover:text-red-300'
                                    : 'text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active',
                            )}
                        >
                            <Icons.ExclamationTriangle className="h-4 w-4" />
                            {errorCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-medium text-white">
                                    {errorCount > 99 ? '99+' : errorCount}
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent sideOffset={5} hideArrow>
                    {errorCount === 0
                        ? t(transKeys.editor.panels.edit.tabs.chat.errors.consoleNoErrors)
                        : t(transKeys.editor.panels.edit.tabs.chat.errors.consoleViewAndFix)}
                </TooltipContent>
            </Tooltip>
            <PopoverContent side="top" align="start" sideOffset={8} className="w-[28rem] p-0">
                <div className="border-border flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-2">
                        <Icons.ExclamationTriangle
                            className={cn(
                                'h-4 w-4',
                                errorCount > 0 ? 'text-red-400' : 'text-foreground-tertiary',
                            )}
                        />
                        <span className="text-small text-foreground-primary font-medium">
                            {errorCount === 0
                                ? t(transKeys.editor.panels.edit.tabs.chat.errors.noErrors)
                                : t(transKeys.editor.panels.edit.tabs.chat.errors.errorCount, {
                                      count: errorCount,
                                  })}
                        </span>
                    </div>
                    {errorCount > 0 && (
                        <div className="flex items-center gap-1">
                            <CopyButton onClick={handleCopyAll} label="Copy all" />
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={handleFix}
                            >
                                <Icons.MagicWand className="mr-1.5 h-3.5 w-3.5" />
                                {t(transKeys.editor.panels.edit.tabs.chat.errors.fixWithAi)}
                            </Button>
                        </div>
                    )}
                </div>
                <div className="max-h-72 overflow-auto px-3 py-2">
                    {errorCount === 0 ? (
                        <p className="text-foreground-tertiary text-mini py-3 text-center">
                            {t(transKeys.editor.panels.edit.tabs.chat.errors.cleanDevServer)}
                        </p>
                    ) : (
                        errors.map((error: ParsedError) => {
                            const severity = classifySeverity(error.content);
                            return (
                                <div
                                    key={`${error.branchId}-${error.content}`}
                                    className={cn(
                                        'group mb-2 rounded-md border p-2 last:mb-0',
                                        SEVERITY_BORDER[severity],
                                    )}
                                >
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-mini text-foreground-tertiary truncate">
                                            {error.sourceId} • {error.branchName}
                                        </span>
                                        <CopyButton
                                            onClick={() =>
                                                void copyText(formatErrorForCopy(error), 'Entry')
                                            }
                                            label="Copy entry"
                                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                        />
                                    </div>
                                    <pre
                                        className={cn(
                                            'text-micro font-mono whitespace-pre-wrap',
                                            SEVERITY_TEXT[severity],
                                        )}
                                    >
                                        {error.content}
                                    </pre>
                                </div>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});
