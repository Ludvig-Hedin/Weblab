import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { ClientTool } from '../models/client';

export class AskUserQuestionTool extends ClientTool {
    static readonly toolName = 'ask_user_question';
    static readonly description =
        'Ask the user a clarifying question with structured options during planning. Use when you cannot write an accurate plan without user input. Do not use for questions with obvious answers.';
    static readonly parameters = z.object({
        question: z.string().describe('The question to ask the user'),
        options: z
            .array(
                z.object({
                    label: z.string(),
                    description: z.string().optional(),
                }),
            )
            .describe('Clickable option chips the user can select'),
        multiSelect: z
            .boolean()
            .optional()
            .default(false)
            .describe('Whether the user can select multiple options'),
    });
    static readonly icon = Icons.QuestionMarkCircled;

    /**
     * Static resolver Map: handleToolCall stores a resolver here when
     * ask_user_question fires. The PlanQuestionCard UI calls
     * AskUserQuestionTool.resolve(toolCallId, answer) to unblock the stream.
     *
     * Each entry pairs the resolver with a timeout that auto-rejects the
     * resolver if the UI never calls back (component unmounts, user
     * navigates away, etc.) — without this the closure leaks indefinitely.
     */
    static readonly pendingResolvers = new Map<
        string,
        { resolve: (result: { answer: string }) => void; timeout: ReturnType<typeof setTimeout> }
    >();

    /** 5 minutes — long enough for a thoughtful answer, short enough to
     * prevent unbounded growth across multi-hour sessions. */
    static readonly PENDING_RESOLVER_TIMEOUT_MS = 5 * 60 * 1000;

    static register(toolCallId: string, resolve: (result: { answer: string }) => void): void {
        const existing = AskUserQuestionTool.pendingResolvers.get(toolCallId);
        if (existing) clearTimeout(existing.timeout);
        const timeout = setTimeout(() => {
            const entry = AskUserQuestionTool.pendingResolvers.get(toolCallId);
            if (!entry) return;
            AskUserQuestionTool.pendingResolvers.delete(toolCallId);
            entry.resolve({ answer: '' });
        }, AskUserQuestionTool.PENDING_RESOLVER_TIMEOUT_MS);
        AskUserQuestionTool.pendingResolvers.set(toolCallId, { resolve, timeout });
    }

    static resolve(toolCallId: string, answer: string) {
        const entry = AskUserQuestionTool.pendingResolvers.get(toolCallId);
        if (entry) {
            clearTimeout(entry.timeout);
            AskUserQuestionTool.pendingResolvers.delete(toolCallId);
            entry.resolve({ answer });
        }
    }

    // handle() is never called via the normal handleToolCall path —
    // ask_user_question is intercepted before tool instantiation.
    // This implementation satisfies the abstract contract only.
    async handle(
        _args: z.infer<typeof AskUserQuestionTool.parameters>,
        _editorEngine: EditorEngine,
    ): Promise<{ answer: string }> {
        throw new Error(
            'ask_user_question must be handled via AskUserQuestionTool.pendingResolvers',
        );
    }

    static getLabel(): string {
        return 'Asking question';
    }
}
