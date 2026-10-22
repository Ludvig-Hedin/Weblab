import 'server-only';

import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { fetchQuery } from 'convex/nextjs';
import { cloudEditorEntryApi } from '@/lib/cloud-editor-entry-api';
import { getCurrentUser } from './current-user';

/** Request-local decision. A project ID never grants admission by itself. */
export const getCloudProjectEntry = cache(async (projectId: string) => {
    const { userId, getToken } = await auth();
    if (!userId) return { kind: 'signed-out' } as const;
    const token = await getToken({ template: 'convex' });
    if (!token) return { kind: 'denied' } as const;
    const args = { projectId: projectId as Id<'projects'> };
    const ordinaryUser = await getCurrentUser();
    if (ordinaryUser && await fetchQuery(api.projects.hasAccess, args, { token })) {
        return { kind: 'ordinary', token } as const;
    }
    const scoped = await fetchQuery(cloudEditorEntryApi.entry, args, { token });
    if (!scoped || scoped.user.clerkUserId !== userId) return { kind: 'denied' } as const;
    return { kind: 'scoped', scoped, token } as const;
});
