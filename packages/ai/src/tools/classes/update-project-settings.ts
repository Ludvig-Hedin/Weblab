import { z } from 'zod';

import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { ServerTool } from '../models/server';

const settingsInputSchema = z.object({
    runCommand: z.string().optional().describe('Command used to start the dev server.'),
    buildCommand: z.string().optional().describe('Command used to build for production.'),
    installCommand: z.string().optional().describe('Command used to install dependencies.'),
});

interface SettingsCaller {
    project: {
        settings: {
            upsert: {
                mutate: (input: {
                    projectId: string;
                    settings: z.infer<typeof settingsInputSchema> & { projectId: string };
                }) => Promise<unknown>;
            };
        };
    };
}

export class UpdateProjectSettingsTool extends ServerTool {
    static readonly toolName = 'update_project_settings';
    static readonly description =
        'Update one or more project settings (runCommand, buildCommand, installCommand). Only pass the fields you want to change. Auth is enforced server-side via the project owner check.';
    static readonly parameters = settingsInputSchema;
    static readonly icon = Icons.Gear;
    static readonly category = 'settings';
    static readonly provider = 'local';

    static async execute(input: object, ctx: ServerToolContext): Promise<unknown> {
        const args = settingsInputSchema.parse(input);
        const caller = ctx.trpcCaller as SettingsCaller;
        return caller.project.settings.upsert.mutate({
            projectId: ctx.projectId,
            settings: {
                projectId: ctx.projectId,
                ...args,
            },
        });
    }

    static getLabel(): string {
        return 'Updating project settings';
    }
}
