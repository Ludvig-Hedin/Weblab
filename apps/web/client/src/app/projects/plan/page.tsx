'use client';

import type { ToolUIPart } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { type z } from 'zod';

import { AskUserQuestionTool, PlanCompleteTool } from '@weblab/ai/client';
import { Response } from '@weblab/ui/ai-elements';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { PlanApprovalCard } from '@/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/plan-approval-card';
import { PlanQuestionCard } from '@/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/plan-question-card';
import { CreateManagerProvider, useCreateManager } from '@/components/store/create';
import { isNotAuthenticatedError } from '@/components/store/create/manager';
import { usePlanChat } from './use-plan-chat';

function PlanPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const prompt = searchParams.get('prompt') ?? '';
    const user = useQuery(api.users.me, {});
    const createManager = useCreateManager();
    const { setIsAuthModalOpen } = useAuthContext();

    const { messages, isStreaming, stop, sendMessage } = usePlanChat();
    const [sentInitial, setSentInitial] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send the initial prompt once on mount
    useEffect(() => {
        if (sentInitial || !prompt) return;
        setSentInitial(true);
        void sendMessage({ text: prompt });
    }, [sentInitial, prompt, sendMessage]);

    const handleSendFollowUp = () => {
        const text = inputValue.trim();
        if (!text || isStreaming) return;
        setInputValue('');
        void sendMessage({ text });
    };

    const handleBuildNow = async () => {
        if (!user?._id || isCreating) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            const project = await createManager.startCreate(user._id, prompt, []);
            if (project) {
                router.push(`/project/${project.id}`);
                return;
            }
            // Defensive: startCreate is typed `Promise<{ id: string }>` and
            // should either resolve with a project or throw, but if it ever
            // resolves with a nullish value reset the button so the user
            // isn't stuck on a spinner.
            setCreateError('No project was returned. Try again.');
            setIsCreating(false);
        } catch (err) {
            // Session expired between page load and click — re-open the
            // auth modal instead of surfacing a confusing 'NOT_AUTHENTICATED'
            // error message (matches the pattern in `/projects/creating`).
            if (isNotAuthenticatedError(err)) {
                setIsAuthModalOpen(true);
                setIsCreating(false);
                return;
            }
            console.error('Plan → create project failed:', err);
            const message = err instanceof Error ? err.message : 'Failed to start project.';
            setCreateError(message);
            setIsCreating(false);
        }
    };

    return (
        <div className="bg-background-primary flex h-screen flex-col">
            {/* Header */}
            <div className="border-border-primary flex items-center gap-2 border-b px-4 py-3">
                <Icons.Plan className="text-foreground-tertiary h-4 w-4" />
                <span className="text-foreground-primary text-sm font-medium">
                    Planning session
                </span>
                {isStreaming && (
                    <Icons.LoadingSpinner className="text-foreground-tertiary ml-1 h-3.5 w-3.5 animate-spin" />
                )}
                <div className="ml-auto flex gap-2">
                    {isStreaming && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                void stop();
                            }}
                            className="text-foreground-tertiary text-mini h-7"
                        >
                            Stop
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.back()}
                        className="text-foreground-tertiary text-mini h-7"
                    >
                        Cancel
                    </Button>
                </div>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="mx-auto max-w-2xl space-y-4">
                    {messages.map((message) => (
                        <div key={message.id}>
                            {message.role === 'user' && (
                                <div className="flex justify-end">
                                    <div className="bg-background-secondary text-foreground-primary max-w-lg rounded-xl px-3 py-2 text-sm">
                                        {(message.parts ?? [])
                                            .filter((p) => p.type === 'text')
                                            .map((p, i) => (
                                                <span key={i}>{(p as { text: string }).text}</span>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {message.role === 'assistant' && (
                                <div className="space-y-2">
                                    {(message.parts ?? []).map((part, idx) => {
                                        if (part.type === 'text') {
                                            return (
                                                <div
                                                    key={idx}
                                                    className="text-foreground-primary text-sm"
                                                >
                                                    <Response>{part.text}</Response>
                                                </div>
                                            );
                                        }
                                        if (part.type.startsWith('tool-')) {
                                            const toolPart = part as ToolUIPart;
                                            const toolName = toolPart.type.split('-')[1];
                                            if (toolName === AskUserQuestionTool.toolName) {
                                                const args = toolPart.input as z.infer<
                                                    typeof AskUserQuestionTool.parameters
                                                > | null;
                                                if (!args?.question) return null;
                                                return (
                                                    <PlanQuestionCard
                                                        key={toolPart.toolCallId}
                                                        toolCallId={toolPart.toolCallId}
                                                        input={args}
                                                        answered={
                                                            toolPart.state === 'output-available'
                                                        }
                                                    />
                                                );
                                            }
                                            if (toolName === PlanCompleteTool.toolName) {
                                                const args = toolPart.input as z.infer<
                                                    typeof PlanCompleteTool.parameters
                                                > | null;
                                                return (
                                                    <PlanApprovalCard
                                                        key={toolPart.toolCallId}
                                                        input={{ summary: args?.summary ?? '' }}
                                                        isStream={
                                                            isStreaming &&
                                                            toolPart.state !== 'output-available'
                                                        }
                                                        onBuildNow={() => {
                                                            void handleBuildNow();
                                                        }}
                                                    />
                                                );
                                            }
                                        }
                                        return null;
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                    {messages.length === 0 && !isStreaming && (
                        <div className="text-foreground-tertiary py-8 text-center text-sm">
                            {prompt
                                ? 'Starting planning session…'
                                : 'Describe your project to start planning.'}
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Inline error surface for "Build now" failures. Without this the
                button silently resets and the user has no idea why nothing
                happened. */}
            {createError && (
                <div className="border-border-primary border-t px-4 py-2">
                    <div
                        className="text-foreground-warning bg-background-warning/40 mx-auto max-w-2xl rounded-md px-3 py-2 text-xs"
                        role="alert"
                    >
                        {createError}
                    </div>
                </div>
            )}

            {/* Input */}
            <div className="border-border-primary border-t px-4 py-3">
                <div className="mx-auto max-w-2xl">
                    <div className="border-border-primary bg-background-secondary flex items-end gap-2 rounded-xl border px-3 py-2">
                        <textarea
                            className="text-foreground-primary placeholder:text-foreground-tertiary min-h-[36px] flex-1 resize-none bg-transparent text-sm outline-none"
                            placeholder="Ask a follow-up or refine the plan…"
                            rows={1}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendFollowUp();
                                }
                            }}
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            disabled={isStreaming || !inputValue.trim()}
                            onClick={handleSendFollowUp}
                            className="h-7 w-7 shrink-0"
                        >
                            <Icons.ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PlanPage() {
    return (
        <CreateManagerProvider>
            <PlanPageInner />
        </CreateManagerProvider>
    );
}
