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
import type * as ImportedStudioActions from '@convex/cloudEditorImportedStudioActions';
import type * as ImportedStudio from '@convex/cloudEditorImportedStudio';
import type * as JournalActions from '@convex/cloudEditorCmsActions';
import type * as Images from '@convex/cloudEditorContentImages';
import type * as Properties from '@convex/cloudEditorProperties';
import type * as PropertyActions from '@convex/cloudEditorPropertyActions';
import type * as Text from '@convex/cloudEditorText';
import type * as TextActions from '@convex/cloudEditorTextActions';
import type * as ImportPreparation from '@convex/cloudEditorImportPreparationActions';

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
type ImportedStudioApi = ApiFromModules<{ actions: typeof ImportedStudioActions; studio: typeof ImportedStudio }>;
type StudioApi = ApiFromModules<{ studio: typeof StudioActions; journal: typeof JournalActions }>;
type ImagesApi = ApiFromModules<{ images: typeof Images }>['images'];
type PropertyApi = ApiFromModules<{ properties: typeof Properties; actions: typeof PropertyActions }>;
type TextApi = ApiFromModules<{ text: typeof Text; actions: typeof TextActions }>;
type ImportPreparationApi = ApiFromModules<{ preparation: typeof ImportPreparation }>['preparation'];

export const cloudEditorApi = {
    propertyContracts: makeFunctionReference<'query', FunctionArgs<PropertyApi['properties']['contracts']>, FunctionReturnType<PropertyApi['properties']['contracts']>>('cloudEditorProperties:contracts'),
    resolvePropertySelection: makeFunctionReference<'action', FunctionArgs<PropertyApi['actions']['resolveSelection']>, FunctionReturnType<PropertyApi['actions']['resolveSelection']>>('cloudEditorPropertyActions:resolveSelection'),
    approveProperty: makeFunctionReference<'action', FunctionArgs<PropertyApi['actions']['approve']>, FunctionReturnType<PropertyApi['actions']['approve']>>('cloudEditorPropertyActions:approve'),
    revokeProperty: makeFunctionReference<'mutation', FunctionArgs<PropertyApi['properties']['revoke']>, FunctionReturnType<PropertyApi['properties']['revoke']>>('cloudEditorProperties:revoke'),
    commitProperty: makeFunctionReference<'action', FunctionArgs<PropertyApi['actions']['commit']>, FunctionReturnType<PropertyApi['actions']['commit']>>('cloudEditorPropertyActions:commit'),
    reapproveImportedStudio: makeFunctionReference<'action', FunctionArgs<ImportedStudioApi['actions']['reapprove']>, FunctionReturnType<ImportedStudioApi['actions']['reapprove']>>('cloudEditorImportedStudioActions:reapprove'),
    pauseImportedStudio: makeFunctionReference<'mutation', FunctionArgs<ImportedStudioApi['studio']['pause']>, FunctionReturnType<ImportedStudioApi['studio']['pause']>>('cloudEditorImportedStudio:pause'),
    importedStudio: makeFunctionReference<'query', FunctionArgs<ImportedStudioApi['studio']['get']>, FunctionReturnType<ImportedStudioApi['studio']['get']>>('cloudEditorImportedStudio:get'),
    commitImportedStudio: makeFunctionReference<'action', FunctionArgs<ImportedStudioApi['actions']['commit']>, FunctionReturnType<ImportedStudioApi['actions']['commit']>>('cloudEditorImportedStudioActions:commit'),
    imageContracts: makeFunctionReference<'query', FunctionArgs<ImagesApi['imageContracts']>, FunctionReturnType<ImagesApi['imageContracts']>>('cloudEditorContentImages:imageContracts'),
    resolveImageSelection: makeFunctionReference<'action', FunctionArgs<BackendApi['cloudEditorContentImageActions']['resolveSelection']>, FunctionReturnType<BackendApi['cloudEditorContentImageActions']['resolveSelection']>>('cloudEditorContentImageActions:resolveSelection'),
    approveImage: makeFunctionReference<'action', FunctionArgs<BackendApi['cloudEditorContentImageActions']['approveV2']>, FunctionReturnType<BackendApi['cloudEditorContentImageActions']['approveV2']>>('cloudEditorContentImageActions:approveV2'),
    revokeImage: makeFunctionReference<'mutation', FunctionArgs<ImagesApi['revokeV2']>, FunctionReturnType<ImagesApi['revokeV2']>>('cloudEditorContentImages:revokeV2'),
    commitImageV2: makeFunctionReference<'action', FunctionArgs<BackendApi['cloudEditorContentImageActions']['commitV2']>, FunctionReturnType<BackendApi['cloudEditorContentImageActions']['commitV2']>>('cloudEditorContentImageActions:commitV2'),
    cancelImageV2: makeFunctionReference<'mutation', FunctionArgs<ImagesApi['cancelPreparationV2']>, FunctionReturnType<ImagesApi['cancelPreparationV2']>>('cloudEditorContentImages:cancelPreparationV2'),

    resolveTextSelection: makeFunctionReference<'action', FunctionArgs<TextApi['actions']['resolveSelection']>, FunctionReturnType<TextApi['actions']['resolveSelection']>>('cloudEditorTextActions:resolveSelection'),
    textContracts: makeFunctionReference<'query', FunctionArgs<TextApi['text']['contracts']>, FunctionReturnType<TextApi['text']['contracts']>>('cloudEditorText:contracts'),
    approveText: makeFunctionReference<'action', FunctionArgs<TextApi['actions']['approve']>, FunctionReturnType<TextApi['actions']['approve']>>('cloudEditorTextActions:approve'),
    revokeText: makeFunctionReference<'mutation', FunctionArgs<TextApi['text']['revoke']>, FunctionReturnType<TextApi['text']['revoke']>>('cloudEditorText:revoke'),
    commitText: makeFunctionReference<'action', FunctionArgs<TextApi['actions']['commit']>, FunctionReturnType<TextApi['actions']['commit']>>('cloudEditorTextActions:commit'),
    prepareImport: makeFunctionReference<'action', FunctionArgs<ImportPreparationApi['prepare']>, FunctionReturnType<ImportPreparationApi['prepare']>>('cloudEditorImportPreparationActions:prepare'),
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
export type CloudEditorImportPreparation = FunctionArgs<ImportPreparationApi['prepare']>;
export type CloudEditorImportPreparationResult = FunctionReturnType<ImportPreparationApi['prepare']>;
export type CloudDesignerOperation = CloudEditorCommit & {
    transport: 'design';
    transportVersion: 1;
};
export type CloudImageOperation = FunctionArgs<BackendApi['cloudEditorContentImageActions']['commit']>;
export type CloudStudioOperation = FunctionArgs<StudioApi['studio']['commit']> & { transport: 'studio'; transportVersion: 1; changes: [] };
export type CloudJournalOperation = FunctionArgs<StudioApi['journal']['commit']> & { transport: 'journal'; transportVersion: 1; changes: [] };
export type CloudImportedStudioOperation = FunctionArgs<ImportedStudioApi['actions']['commit']> & { transport: 'studio'; transportVersion: 2; changes: [] };
export type CloudSemanticOperation = CloudStudioOperation | CloudJournalOperation | CloudImportedStudioOperation;
export type CloudSemanticRequest = Omit<CloudStudioOperation | CloudJournalOperation, 'operationId' | 'transportVersion' | 'changes' | 'projectId' | 'branchId'> & { transportVersion?: 1 }
    | Omit<CloudImportedStudioOperation, 'operationId' | 'changes' | 'projectId' | 'branchId'>;
export type CloudTextContracts = FunctionReturnType<TextApi['text']['contracts']>;
export type CloudTextOperation = FunctionArgs<TextApi['actions']['commit']>;
export type CloudImageV2Contracts = FunctionReturnType<ImagesApi['imageContracts']>;
export type CloudImageV2Operation = FunctionArgs<BackendApi['cloudEditorContentImageActions']['commitV2']>;
export type CloudPropertyContracts = FunctionReturnType<PropertyApi['properties']['contracts']>;
export type CloudPropertyOperation = FunctionArgs<PropertyApi['actions']['commit']>;
export type CloudSourceOperation = CloudPropertyOperation | CloudImageV2Operation | CloudTextOperation | CloudDesignerOperation | CloudEditorContentCommit | CloudImageOperation | CloudSemanticOperation;
