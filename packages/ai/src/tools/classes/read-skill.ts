import { z } from 'zod';

import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { loadSkillByName } from '../../skills/registry';
import { ServerTool } from '../models/server';

export class ReadSkillTool extends ServerTool {
    static readonly toolName = 'read_skill';
    static readonly description =
        'Read the full SKILL.md instructions for a named Agent Skill. Use after list_skills to fetch the body of a skill the user has invoked or a skill that is clearly relevant to the request.';
    static readonly parameters = z.object({
        name: z
            .string()
            .min(1)
            .describe(
                'The skill name as returned by list_skills (frontmatter name, or directory).',
            ),
    });
    static readonly icon = Icons.Brand;
    static readonly category = 'skills';
    static readonly provider = 'local';
    static readonly requiresProject = false;

    static async execute(input: object, ctx: ServerToolContext) {
        const args = ReadSkillTool.parameters.parse(input);
        const skill = await loadSkillByName(args.name, {
            userId: ctx.userId,
            projectId: ctx.projectId,
            trpcCaller: ctx.trpcCaller,
        });
        if (!skill) {
            throw new Error(`Skill "${args.name}" not found. Call list_skills first.`);
        }
        return {
            name: skill.name,
            description: skill.description,
            content: skill.content,
            location: skill.location,
        };
    }

    static getLabel(input?: z.infer<typeof ReadSkillTool.parameters>): string {
        if (input?.name) return `Reading skill "${input.name}"`;
        return 'Reading skill';
    }
}
