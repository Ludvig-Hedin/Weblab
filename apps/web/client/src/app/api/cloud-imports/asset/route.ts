import { createClerkClient } from '@clerk/nextjs/server';
import { importSessionToken } from '@/lib/cloud-imports/auth';
import { fetchQuery } from 'convex/nextjs';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Imports from '@convex/cloudEditorImports';
import type { Id } from '@convex/_generated/dataModel';
import { env } from '@/env';
import { createImportAssetHandler } from '@/lib/cloud-imports/transport';

export const runtime = 'nodejs';
export const maxDuration = 30;
type API = ApiFromModules<{ imports: typeof Imports }>['imports'];
const asset = makeFunctionReference<'query', FunctionArgs<API['_asset']>, FunctionReturnType<API['_asset']>>('cloudEditorImports:_asset');
const download = createImportAssetHandler({
    siteUrl: env.NEXT_PUBLIC_SITE_URL, convexUrl: env.NEXT_PUBLIC_CONVEX_URL, secret: env.WEBLAB_CLOUD_IMPORT_SECRET,
    authenticate: request => {
        if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return Promise.resolve(null);
        const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
        return importSessionToken(request, env.NEXT_PUBLIC_SITE_URL, (input, options) => clerk.authenticateRequest(input, options));
    },
    asset: (args, token) => fetchQuery(asset, {
        ...args, projectId: args.projectId as Id<'projects'>, branchId: args.branchId as Id<'branches'>,
    }, { token }),
});

export async function GET(request: Request) { return download(request); }
