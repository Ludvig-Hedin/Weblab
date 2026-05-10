import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { ClientTool } from '../models/client';

export class PlanCompleteTool extends ClientTool {
    static readonly toolName = 'plan_complete';
    static readonly description =
        'Signal that the plan is fully written and ready for user approval. Call this ONLY after writing the complete plan in your preceding message text. Do not call this before the plan is written.';
    static readonly parameters = z.object({
        summary: z
            .string()
            .describe(
                '1-2 sentence summary of what the plan covers — shown in the approval card header',
            ),
    });
    static readonly icon = Icons.Clipboard;

    async handle(
        _args: z.infer<typeof PlanCompleteTool.parameters>,
        _editorEngine: EditorEngine,
    ): Promise<{ acknowledged: boolean }> {
        return { acknowledged: true };
    }

    static getLabel(): string {
        return 'Plan ready';
    }
}
