import { z } from 'zod';

import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { ServerTool } from '../models/server';

interface SettingsCaller {
    project: {
        settings: {
            get: { query: (input: { projectId: string }) => Promise<unknown> };
        };
    };
}

export class GetProjectSettingsTool extends ServerTool {
    static readonly toolName = 'get_project_settings';
    static readonly description =
        'Read the current project settings (runCommand, buildCommand, installCommand). Returns null if no settings row exists yet.';
    static readonly parameters = z.object({});
    static readonly icon = Icons.Gear;
    static readonly category = 'settings';
    static readonly provider = 'local';

    static async execute(_input: object, ctx: ServerToolContext): Promise<unknown> {
        const caller = ctx.trpcCaller as SettingsCaller;
        return caller.project.settings.get.query({ projectId: ctx.projectId });
    }

    static getLabel(): string {
        return 'Reading project settings';
    }
}
