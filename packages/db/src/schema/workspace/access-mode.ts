import { pgEnum } from 'drizzle-orm/pg-core';

import { ProjectAccessMode } from '@weblab/models';

export const projectAccessMode = pgEnum('project_access_mode', ProjectAccessMode);
