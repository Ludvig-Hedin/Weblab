import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { WEBLAB_INSTRUCTIONS } from '../../prompt/constants';
import { ClientTool } from '../models/client';

export class WeblabInstructionsTool extends ClientTool {
    static readonly toolName = 'weblab_instructions';
    static readonly description = 'Get Weblab-specific instructions and guidelines';
    static readonly parameters = z.object({});
    static readonly icon = Icons.WeblabLogo;

    async handle(
        _input: z.infer<typeof WeblabInstructionsTool.parameters>,
        _editorEngine: EditorEngine,
    ): Promise<string> {
        return WEBLAB_INSTRUCTIONS;
    }

    static getLabel(input?: z.infer<typeof WeblabInstructionsTool.parameters>): string {
        return 'Reading Weblab instructions';
    }
}
