import type { ApiFromModules } from 'convex/server';
import { makeFunctionReference } from 'convex/server';

import type * as Backend from '@convex/cloudPilot';

type PilotApi = ApiFromModules<{ cloudPilot: typeof Backend }>['cloudPilot'];

// Keep this isolated experiment independent of generated files owned by other work.
export const pilotApi: PilotApi = {
    workspace: makeFunctionReference('cloudPilot:workspace'),
    create: makeFunctionReference('cloudPilot:create'),
    get: makeFunctionReference('cloudPilot:get'),
    save: makeFunctionReference('cloudPilot:save'),
};
