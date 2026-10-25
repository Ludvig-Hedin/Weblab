import { createClerkClient } from '@clerk/nextjs/server';
import { env } from '@/env';
import { fetchQuery } from 'convex/nextjs';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Images from '@convex/cloudEditorContentImages';
import { inspectCloudImageDimensions } from '../decode';
import { createImageInspectionV2Handler } from '../transport-v2';

export const runtime = 'nodejs';
export const maxDuration = 30;
type API = ApiFromModules<{ images: typeof Images }>['images'];
const asset = makeFunctionReference<'query', FunctionArgs<API['_inspectionAssetV2']>, FunctionReturnType<API['_inspectionAssetV2']>>('cloudEditorContentImages:_inspectionAssetV2');
const inspect = createImageInspectionV2Handler({
    siteUrl: env.NEXT_PUBLIC_SITE_URL, convexUrl: env.NEXT_PUBLIC_CONVEX_URL, secret: env.WEBLAB_CLOUD_IMAGE_SECRET,
    verify: (request, options) => {
        if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error('Missing session verifier');
        return createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }).authenticateRequest(request, options);
    },
    asset: (args, token) => fetchQuery(asset, args, { token }),
    inspect: inspectCloudImageDimensions,
});

export async function POST(request: Request) { return inspect(request); }
