import { z } from 'zod';

import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { loadSkillSummaries } from '../../skills/registry';
import { ServerTool } from '../models/server';

export class ListSkillsTool extends ServerTool {
    static readonly toolName = 'list_skills';
    static readonly description =
        "List the Agent Skills available in this repository. Returns each skill's name and one-line description. Use read_skill to fetch the full instructions for a specific skill before applying it.";
    static readonly parameters = z.object({});
    static readonly icon = Icons.Brand;
    static readonly category = 'skills';
    static readonly provider = 'local';
    static readonly requiresProject = false;

    static async execute(_input: object, ctx: ServerToolContext) {
        const summaries = await loadSkillSummaries({
            userId: ctx.userId,
            projectId: ctx.projectId,
            trpcCaller: ctx.trpcCaller,
        });
        return { skills: summaries };
    }

    static getLabel(): string {
        return 'Listing skills';
    }
}
