import type { ProjectSettings as DbProjectSettings } from '@weblab/db';
import { DefaultSettings } from '@weblab/constants';

export const createDefaultProjectSettings = (projectId: string): DbProjectSettings => {
    return {
        projectId,
        buildCommand: DefaultSettings.COMMANDS.build,
        runCommand: DefaultSettings.COMMANDS.run,
        installCommand: DefaultSettings.COMMANDS.install,
    };
};
