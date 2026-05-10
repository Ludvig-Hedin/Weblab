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
     */
    static readonly pendingResolvers = new Map<string, (result: { answer: string }) => void>();

    static resolve(toolCallId: string, answer: string) {
        const resolver = AskUserQuestionTool.pendingResolvers.get(toolCallId);
        if (resolver) {
            resolver({ answer });
            AskUserQuestionTool.pendingResolvers.delete(toolCallId);
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
