'use node';

import { v } from 'convex/values';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { action } from './_generated/server';
import type * as Cms from './cloudEditorCms';
import { journalOperation } from './cloudEditorStudioSchema';
import { assertCloudRevision, assertOperationId, cloudScope } from './lib/cloudEditor';
import { draftStudioArtifact, serializeStudioArtifact, STUDIO_JSON_PATH } from './lib/cloudStudioContent';
import { studioFingerprint, studioHash } from './lib/cloudStudioTemplate';

type Api = ApiFromModules<{ cms: typeof Cms }>['cms'];
const inputRef = makeFunctionReference<'query', FunctionArgs<Api['_input']>, FunctionReturnType<Api['_input']>>('cloudEditorCms:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<Api['_commit']>, FunctionReturnType<Api['_commit']>>('cloudEditorCms:_commit');
export const commit = action({
    args: { ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(), expectedGeneration: v.number(), operationId: v.string(), operation: journalOperation },
    handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
        assertOperationId(args.operationId); assertCloudRevision(args.expectedRevision);
        const fingerprint = studioFingerprint('cloud-studio-journal-v1', args);
        const envelope = { ...args, fingerprint };
        const input = await ctx.runQuery(inputRef, envelope);
        if (input.receipt) return input.receipt;
        const studio = input.snapshot!.studio;
        const content = serializeStudioArtifact(draftStudioArtifact(studio));
        return ctx.runMutation(commitRef, { ...envelope, items: studio.items,
            change: { path: STUDIO_JSON_PATH, content, hash: studioHash(content), bytes: Buffer.byteLength(content) } });
    },
});
