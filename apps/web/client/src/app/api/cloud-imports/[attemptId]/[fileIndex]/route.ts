import { createClerkClient } from '@clerk/nextjs/server';
import { importSessionToken } from '@/lib/cloud-imports/auth';
import { fetchMutation } from 'convex/nextjs';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Imports from '@convex/cloudEditorImports';
import type { Id } from '@convex/_generated/dataModel';
import { env } from '@/env';
import { createImportUploadHandler } from '@/lib/cloud-imports/transport';

export const runtime = 'nodejs';
export const maxDuration = 120;
type API = ApiFromModules<{ imports: typeof Imports }>['imports'];
const claim = makeFunctionReference<'mutation', FunctionArgs<API['claimUpload']>, FunctionReturnType<API['claimUpload']>>('cloudEditorImports:claimUpload');
const sending = makeFunctionReference<'mutation', FunctionArgs<API['markSending']>, FunctionReturnType<API['markSending']>>('cloudEditorImports:markSending');
const owned = makeFunctionReference<'mutation', FunctionArgs<API['recordOwned']>, FunctionReturnType<API['recordOwned']>>('cloudEditorImports:recordOwned');
const failed = makeFunctionReference<'mutation', FunctionArgs<API['failUpload']>, FunctionReturnType<API['failUpload']>>('cloudEditorImports:failUpload');
const upload = createImportUploadHandler({
    siteUrl: env.NEXT_PUBLIC_SITE_URL, convexUrl: env.NEXT_PUBLIC_CONVEX_URL, secret: env.WEBLAB_CLOUD_IMPORT_SECRET,
    authenticate: request => {
        if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return Promise.resolve(null);
        const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
        return importSessionToken(request, env.NEXT_PUBLIC_SITE_URL, (input, options) => clerk.authenticateRequest(input, options));
    },
    claimUpload: (args, token) => fetchMutation(claim, { ...args, attemptId: args.attemptId as Id<'cloudEditorImports'> }, { token }),
    markSending: (args, token) => fetchMutation(sending, { ...args, attemptId: args.attemptId as Id<'cloudEditorImports'> }, { token }),
    recordOwned: args => fetchMutation(owned, { ...args, attemptId: args.attemptId as Id<'cloudEditorImports'>, storageId: args.storageId as Id<'_storage'> }),
    failUpload: args => fetchMutation(failed, { ...args, attemptId: args.attemptId as Id<'cloudEditorImports'> }),
});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string; fileIndex: string }> }) {
    return upload(request, await context.params);
}
