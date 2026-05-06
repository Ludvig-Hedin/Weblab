import { v4 as uuidv4 } from 'uuid';

import type { Project as DbProject } from '@weblab/db';

export const createDefaultProject = ({
    overrides = {},
}: {
    overrides?: Partial<DbProject>;
}): DbProject => {
    return {
        id: uuidv4(),
        name: 'New Project',
        description: 'Your new project',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        previewImgUrl: null,
        previewImgPath: null,
        previewImgBucket: null,
        updatedPreviewImgAt: null,
        storageMode: 'cloud',
        runtimeMetadata: {},
        ...overrides,

        // deprecated
        sandboxId: null,
        sandboxUrl: null,
    } satisfies DbProject;
};
