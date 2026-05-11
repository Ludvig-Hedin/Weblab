'use client';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { Section } from '../section';

export function ChatDemo() {
    return (
        <div id="chat">
            <Section
                title="Chat"
                tag="chat"
                filePath="apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab"
            >
                <div className="flex max-w-xl flex-col gap-3">
                    <div className="flex justify-end">
                        <div className="bg-background-primary text-small flex flex-col rounded-xl px-3 py-2 leading-snug tracking-[-0.005em] shadow-sm">
                            Add dark mode support to the editor.
                        </div>
                    </div>
                    <div className="text-small flex flex-col gap-1.5 px-3 py-2 leading-snug tracking-[-0.005em]">
                        Reading <code className="text-foreground-secondary">page.tsx</code> to
                        understand the current theme setup, then I'll add a system-aware dark-mode
                        toggle.
                    </div>
                    <div className="bg-background-secondary/40 flex flex-col gap-2 rounded-md p-3">
                        <p className="text-foreground-tertiary text-mini font-medium">
                            Tool-call states
                        </p>
                        <div className="text-foreground-tertiary/80 my-1 flex items-center gap-2">
                            <Icons.LoadingSpinner className="size-4 animate-spin" />
                            <span className="text-regularPlus">Reading page.tsx</span>
                            <span className="text-foreground-tertiary text-mini ml-auto">
                                running
                            </span>
                        </div>
                        <div className="text-foreground-tertiary/80 my-1 flex items-center gap-2">
                            <Icons.CheckCircled className="text-foreground-success size-4" />
                            <span className="text-regularPlus">Reading page.tsx</span>
                            <span className="text-foreground-tertiary text-mini ml-auto">
                                done · 1.2s
                            </span>
                        </div>
                        <div className="text-foreground-tertiary my-1 flex items-center gap-2">
                            <Icons.ExclamationTriangle className="text-foreground-warning size-4" />
                            <span className="text-regularPlus">Reading page.tsx</span>
                            <span className="text-foreground-tertiary text-mini ml-auto">
                                stalled · retry
                            </span>
                        </div>
                    </div>
                    <div className="bg-background-secondary/40 flex flex-col gap-2 rounded-md p-3">
                        <p className="text-foreground-tertiary text-mini font-medium">
                            Reasoning effort
                        </p>
                        <div className="bg-background-secondary/40 grid grid-cols-3 gap-0.5 rounded-md p-0.5">
                            {['Fast', 'Balanced', 'Deep'].map((label, i) => (
                                <button
                                    key={label}
                                    type="button"
                                    className={cn(
                                        'text-mini rounded-[6px] px-2 py-1 font-medium transition-colors',
                                        i === 0
                                            ? 'bg-background-primary text-foreground-primary shadow-sm'
                                            : 'text-foreground-tertiary hover:text-foreground-secondary',
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Section>
        </div>
    );
}
