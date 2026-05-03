import { v4 as uuidv4 } from 'uuid';

import type { Conversation as DbConversation } from '@weblab/db';
import { AgentType } from '@weblab/models';

export const createDefaultConversation = (projectId: string): DbConversation => {
    return {
        id: uuidv4(),
        projectId,
        createdAt: new Date(),
        updatedAt: new Date(),
        displayName: 'New Conversation',
        suggestions: [],
        agentType: AgentType.ROOT,
    };
};
