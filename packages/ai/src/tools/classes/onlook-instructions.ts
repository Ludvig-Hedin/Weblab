import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { ONLOOK_INSTRUCTIONS } from '../../prompt/constants';
import { ClientTool } from '../models/client';

export class OnlookInstructionsTool extends ClientTool {
    static readonly toolName = 'onlook_instructions';
    static readonly description = 'Get Onlook-specific instructions and guidelines';
    static readonly parameters = z.object({});
    static readonly icon = Icons.OnlookLogo;

    async handle(
        _input: z.infer<typeof OnlookInstructionsTool.parameters>,
        _editorEngine: EditorEngine,
    ): Promise<string> {
        return ONLOOK_INSTRUCTIONS;
    }

    static getLabel(input?: z.infer<typeof OnlookInstructionsTool.parameters>): string {
        return 'Reading Onlook instructions';
    }
}
