import { clerkClient } from '@clerk/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { makeFunctionReference } from 'convex/server';
import { z } from 'zod';

import type { Id } from '@convex/_generated/dataModel';

const authorize = makeFunctionReference<'query', {
    projectId: Id<'projects'>; branchId: Id<'branches'>;
}, { userId: string; projectId: Id<'projects'>; branchId: Id<'branches'>; rootPath: string; cmsRequired: boolean; productionSwitchEnabled: false }>('nativePublishing:authorize');

const bodySchema = z.object({ projectId: z.string().min(1).max(160), branchId: z.string().min(1).max(160) }).strict();

export async function POST(request: Request) {
    const headers = { 'Cache-Control': 'no-store' };
    const authorization = request.headers.get('Authorization');
    if (!authorization || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(authorization)) {
        return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
    }
    // Authenticate only the supplied token. An invalid bearer must never fall
    // back to a browser cookie belonging to a different signed-in account.
    const tokenRequest = new Request(request.url, { method: 'POST', headers: { Authorization: authorization } });
    try {
        const client = await clerkClient();
        const state = await client.authenticateRequest(tokenRequest, { acceptsToken: 'session_token' });
        const auth = state.toAuth();
        if (!auth?.userId) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
        const raw = await request.text();
        if (raw.length > 1024) return Response.json({ error: 'BAD_REQUEST' }, { status: 400, headers });
        const body = bodySchema.safeParse(JSON.parse(raw));
        if (!body.success) return Response.json({ error: 'BAD_REQUEST' }, { status: 400, headers });
        const token = await auth.getToken({ template: 'convex' });
        if (!token) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
        const verified = await fetchQuery(authorize, {
            projectId: body.data.projectId as Id<'projects'>,
            branchId: body.data.branchId as Id<'branches'>,
        }, { token });
        if (verified.userId !== auth.userId) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
        return Response.json({ ...verified, expiresAt: Date.now() + 15_000 }, { headers });
    } catch {
        return Response.json({ error: 'Publishing access could not be verified.' }, { status: 403, headers });
    }
}
