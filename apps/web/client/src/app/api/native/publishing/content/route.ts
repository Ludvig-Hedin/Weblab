import { clerkClient } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { makeFunctionReference } from 'convex/server';

import type { Id } from '@convex/_generated/dataModel';
import { createNativeContentExportHandler } from '@/lib/native-content-export';
import type { NativeContentExport } from '@/lib/native-content-export';

const exportSelected = makeFunctionReference<'query', {
    projectId: Id<'projects'>; branchId: Id<'branches'>;
    connectionId: Id<'cmsSanityBlogConnections'>; connectionRevision: number;
    selections: { draftId: Id<'cmsSanityBlogDrafts'>; expectedRevision: number; providerRevision: string | null; archived: boolean }[];
}, NativeContentExport>('cmsSanityBlog:exportSelected');

export const POST = createNativeContentExportHandler({
    authenticate: async (request) => {
        const client = await clerkClient();
        const state = await client.authenticateRequest(request, { acceptsToken: 'session_token' });
        const auth = state.toAuth();
        return auth?.userId ? { userId: auth.userId, getToken: (options) => auth.getToken(options) } : null;
    },
    exportContent: async (body, token) => {
        return fetchQuery(exportSelected, {
            projectId: body.projectId as Id<'projects'>,
            branchId: body.branchId as Id<'branches'>,
            connectionId: body.connectionId as Id<'cmsSanityBlogConnections'>,
            connectionRevision: body.connectionRevision,
            selections: body.selections.map((pin) => ({ ...pin, draftId: pin.draftId as Id<'cmsSanityBlogDrafts'> })),
        }, { token });
    },
});
