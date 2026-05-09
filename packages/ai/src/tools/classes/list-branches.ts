import { z } from 'zod';

import type { Branch } from '@weblab/models';
import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';
import { jsonClone } from '@weblab/utility/src/clone';

import { ClientTool } from '../models/client';

export class ListBranchesTool extends ClientTool {
    static readonly toolName = 'list_branches';
    static readonly description = 'List all available branches in the project';
    static readonly parameters = z.object({});
    static readonly icon = Icons.Branch;
    static readonly category = 'project';

    async handle(
        _params: unknown,
        editorEngine: EditorEngine,
    ): Promise<{
        branches: Branch[];
        activeBranchId: string | null;
    }> {
        const branches = jsonClone(editorEngine.branches.allBranches);
        return {
            branches,
            activeBranchId: editorEngine.branches.activeBranch?.id || null,
        };
    }

    static getLabel(input?: z.infer<typeof ListBranchesTool.parameters>): string {
        return 'Listing branches';
    }
}
