import type { ConvexHttpClient } from 'convex/browser';
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import { makeFunctionReference } from 'convex/server';

import type * as Source from '@convex/cloudEditor';
import type * as Access from '@convex/cloudEditorAccess';
import type * as Actions from '@convex/cloudEditorActions';
import type * as Content from '@convex/cloudEditorContent';
import type * as ContentActions from '@convex/cloudEditorContentActions';
import type * as ImageActions from '@convex/cloudEditorContentImageActions';
import type * as PreviewAccess from '@convex/cloudPreviewAccess';
import type * as StudioActions from '@convex/cloudEditorStudioActions';
import type * as JournalActions from '@convex/cloudEditorCmsActions';
import type * as Images from '@convex/cloudEditorContentImages';

type BackendApi = ApiFromModules<{
    cloudEditor: typeof Source;
    cloudEditorActions: typeof Actions;
    cloudEditorAccess: typeof Access;
    cloudEditorContent: typeof Content;
    cloudEditorContentActions: typeof ContentActions;
    cloudEditorContentImageActions: typeof ImageActions;
}>;
type S = BackendApi['cloudEditor'];
type A = BackendApi['cloudEditorActions'];
type C = BackendApi['cloudEditorContent'];
type CA = BackendApi['cloudEditorContentActions'];
type AccessApi = BackendApi['cloudEditorAccess'];

// Type-only backend imports keep Node actions and credentials out of the browser.
type PreviewApi = ApiFromModules<{ preview: typeof PreviewAccess }>['preview'];
type StudioApi = ApiFromModules<{ studio: typeof StudioActions; journal: typeof JournalActions }>;
type ImagesApi = ApiFromModules<{ images: typeof Images }>['images'];

export const cloudEditorApi = {
    cancelImage: makeFunctionReference<'mutation', FunctionArgs<ImagesApi['cancelPreparation']>, null>('cloudEditorContentImages:cancelPreparation'),
    commitStudio: makeFunctionReference<'action', FunctionArgs<StudioApi['studio']['commit']>, FunctionReturnType<StudioApi['studio']['commit']>>('cloudEditorStudioActions:commit'),
    commitJournal: makeFunctionReference<'action', FunctionArgs<StudioApi['journal']['commit']>, FunctionReturnType<StudioApi['journal']['commit']>>('cloudEditorCmsActions:commit'),
    commitImage: makeFunctionReference<'action', FunctionArgs<BackendApi['cloudEditorContentImageActions']['commit']>, FunctionReturnType<BackendApi['cloudEditorContentImageActions']['commit']>>('cloudEditorContentImageActions:commit'),
    issuePreview: makeFunctionReference<
        'mutation',
        FunctionArgs<PreviewApi['issue']>,
        FunctionReturnType<PreviewApi['issue']>
    >('cloudPreviewAccess:issue'),
    access: makeFunctionReference<
        'query',
        FunctionArgs<AccessApi['access']>,
        FunctionReturnType<AccessApi['access']>
    >('cloudEditorAccess:access'),
    contracts: makeFunctionReference<
        'query',
        FunctionArgs<C['contracts']>,
        FunctionReturnType<C['contracts']>
    >('cloudEditorContent:contracts'),
    commitContent: makeFunctionReference<
        'action',
        FunctionArgs<CA['commit']>,
        FunctionReturnType<CA['commit']>
    >('cloudEditorContentActions:commit'),
    workspace: makeFunctionReference<
        'query',
        FunctionArgs<S['workspace']>,
        FunctionReturnType<S['workspace']>
    >('cloudEditor:workspace'),
    snapshot: makeFunctionReference<
        'query',
        FunctionArgs<S['snapshot']>,
        FunctionReturnType<S['snapshot']>
    >('cloudEditor:snapshot'),
    status: makeFunctionReference<
        'query',
        FunctionArgs<S['status']>,
        FunctionReturnType<S['status']>
    >('cloudEditor:status'),
    ensurePreview: makeFunctionReference<
        'mutation',
        FunctionArgs<S['ensurePreview']>,
        FunctionReturnType<S['ensurePreview']>
    >('cloudEditor:ensurePreview'),
    commit: makeFunctionReference<
        'action',
        FunctionArgs<A['commit']>,
        FunctionReturnType<A['commit']>
    >('cloudEditorActions:commit'),
    readAsset: makeFunctionReference<
        'action',
        FunctionArgs<A['readAsset']>,
        FunctionReturnType<A['readAsset']>
    >('cloudEditorActions:readAsset'),
    create: makeFunctionReference<
        'action',
        FunctionArgs<A['create']>,
        FunctionReturnType<A['create']>
    >('cloudEditorActions:create'),
};

export type CloudEditorClient = Pick<ConvexHttpClient, 'query' | 'action' | 'mutation'>;
export type CloudEditorScope = FunctionArgs<S['snapshot']>;
export type CloudEditorSnapshot = FunctionReturnType<S['snapshot']>;
export type CloudEditorRuntimeStatus = FunctionReturnType<S['status']>;
export type CloudEditorCommit = FunctionArgs<A['commit']>;
export type CloudEditorCommitResult = FunctionReturnType<A['commit']>;
export type CloudEditorAccess = FunctionReturnType<AccessApi['access']>;
export type CloudEditorContracts = FunctionReturnType<C['contracts']>;
export type CloudEditorContentCommit = FunctionArgs<CA['commit']>;
export type CloudDesignerOperation = CloudEditorCommit & {
    transport: 'design';
    transportVersion: 1;
};
export type CloudImageOperation = FunctionArgs<BackendApi['cloudEditorContentImageActions']['commit']>;
export type CloudStudioOperation = FunctionArgs<StudioApi['studio']['commit']> & { transport: 'studio'; transportVersion: 1; changes: [] };
export type CloudJournalOperation = FunctionArgs<StudioApi['journal']['commit']> & { transport: 'journal'; transportVersion: 1; changes: [] };
export type CloudSemanticOperation = CloudStudioOperation | CloudJournalOperation;
export type CloudSourceOperation = CloudDesignerOperation | CloudEditorContentCommit | CloudImageOperation | CloudSemanticOperation;
