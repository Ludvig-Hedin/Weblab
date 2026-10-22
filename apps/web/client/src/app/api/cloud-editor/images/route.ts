import { auth, createClerkClient } from '@clerk/nextjs/server';
import { env } from '@/env';
import { fetchMutation, fetchAction } from 'convex/nextjs';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Images from '@convex/cloudEditorContentImages';
import type * as Actions from '@convex/cloudEditorContentImageActions';
import { imageHash, imageProof, MAX_CLOUD_IMAGE_INPUT, MAX_CLOUD_IMAGE_BYTES, CLOUD_IMAGE_PIXELS } from '@convex/lib/cloudContentImage';
import { decodeCloudImage, decodeCloudImageWithMetadata } from './decode';
import { imageUploadOriginAllowed } from './origin';
import { createImageUploadV2Handler } from './transport-v2';
export const runtime = 'nodejs';
export const maxDuration = 30;
type API = ApiFromModules<{ images: typeof Images; actions: typeof Actions }>;
const reserve = makeFunctionReference<'mutation', FunctionArgs<API['images']['reserve']>, FunctionReturnType<API['images']['reserve']>>('cloudEditorContentImages:reserve');
const prepare = makeFunctionReference<'action', FunctionArgs<API['actions']['prepare']>, FunctionReturnType<API['actions']['prepare']>>('cloudEditorContentImageActions:prepare');
const cancel = makeFunctionReference<'mutation', FunctionArgs<API['images']['cancelPreparation']>, null>('cloudEditorContentImages:cancelPreparation');
const reserveV2 = makeFunctionReference<'mutation', FunctionArgs<API['images']['reserveV2']>, FunctionReturnType<API['images']['reserveV2']>>('cloudEditorContentImages:reserveV2');
const prepareV2 = makeFunctionReference<'action', FunctionArgs<API['actions']['prepareV2']>, FunctionReturnType<API['actions']['prepareV2']>>('cloudEditorContentImageActions:prepareV2');
const cancelV2 = makeFunctionReference<'mutation', FunctionArgs<API['images']['cancelPreparationV2']>, null>('cloudEditorContentImages:cancelPreparationV2');
const uploadV2 = createImageUploadV2Handler({
    siteUrl: env.NEXT_PUBLIC_SITE_URL, secret: env.WEBLAB_CLOUD_IMAGE_SECRET,
    verify: (request, options) => {
        if (!env.CLERK_SECRET_KEY || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error('Missing session verifier');
        return createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }).authenticateRequest(request, options);
    },
    reserve: (args, token) => fetchMutation(reserveV2, args, { token }),
    prepare: (args, token) => fetchAction(prepareV2, args, { token }),
    cancel: (args, token) => fetchMutation(cancelV2, args, { token }),
    decode: decodeCloudImageWithMetadata,
});
export async function POST(request: Request) {
    if (request.headers.has('x-weblab-image-protocol')) {
        if (request.headers.get('x-weblab-image-protocol') !== '2') return Response.json({ error: 'CLOUD_IMAGE_UPLOAD_FAILED' }, {
            status: 400, headers: { 'Cache-Control': 'private, no-store' },
        });
        return uploadV2(request);
    }
    let pendingAttempt: FunctionReturnType<API['images']['reserve']> | null = null;
    let authToken: string | null = null;
    try {
        const session = await auth();
        if (!session.userId) return new Response(null, { status: 401 });
        if (!imageUploadOriginAllowed(request, env.NEXT_PUBLIC_SITE_URL)) return new Response(null, { status: 403 });
        const secret = env.WEBLAB_CLOUD_IMAGE_SECRET ?? '';
        if (secret.length < 32) return new Response(null, { status: 503 });
        const token = await session.getToken({ template: 'convex' });
        authToken = token;
        if (!token) return new Response(null, { status: 401 });
        const metadata = request.headers.get('x-weblab-image-target');
        if (!metadata || metadata.length > 2000) return new Response(null, { status: 400 });
        const target: FunctionArgs<API['images']['reserve']> = JSON.parse(metadata);
        // Server validators and live target admission run before image decoding/spending.
        const attemptId = await fetchMutation(reserve, target, { token });
        pendingAttempt = attemptId;
        const reader = request.body?.getReader();
        if (!reader) throw new Error('Missing image');
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > MAX_CLOUD_IMAGE_INPUT) { await reader.cancel(); throw new Error('Image too large'); }
            chunks.push(part.value);
        }
        const bytes = await decodeCloudImage(Buffer.concat(chunks), { maxBytes: MAX_CLOUD_IMAGE_BYTES, maxPixels: CLOUD_IMAGE_PIXELS });
        const hash = imageHash(bytes);
        const prepared = await fetchAction(prepare, { attemptId, bytes: Uint8Array.from(bytes).buffer, proof: imageProof(secret, attemptId, hash) }, { token });
        return Response.json({ ...prepared, bytes: bytes.toString('base64') }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        if (pendingAttempt && authToken) {
            try { await fetchMutation(cancel, { attemptId: pendingAttempt }, { token: authToken }); } catch { /* Existing expiry retains cleanup ownership. */ }
        }
        return Response.json({ error: 'CLOUD_IMAGE_UPLOAD_FAILED' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
}
