'use client';

import { useLocale } from 'next-intl';
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import { makeFunctionReference } from 'convex/server';
import type { Infer } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import type * as Studio from '@convex/cloudEditorStudio';
import type * as StudioActions from '@convex/cloudEditorStudioActions';
import type * as Cms from '@convex/cloudEditorCms';
import type * as CmsActions from '@convex/cloudEditorCmsActions';
import type { studioOperation, journalOperation } from '@convex/cloudEditorStudioSchema';
import en from '../../../messages/cloud-studio/en.json';
import sv from '../../../messages/cloud-studio/sv.json';

type Api = ApiFromModules<{ studio: typeof Studio; studioActions: typeof StudioActions; cms: typeof Cms; cmsActions: typeof CmsActions }>;
type S = Api['studio']; type SA = Api['studioActions']; type C = Api['cms']; type CA = Api['cmsActions'];
export const cloudStudioApi = {
    get: makeFunctionReference<'query', FunctionArgs<S['get']>, FunctionReturnType<S['get']>>('cloudEditorStudio:get'),
    journal: makeFunctionReference<'query', FunctionArgs<C['list']>, FunctionReturnType<C['list']>>('cloudEditorCms:list'),
    structure: makeFunctionReference<'action', FunctionArgs<SA['commit']>, FunctionReturnType<SA['commit']>>('cloudEditorStudioActions:commit'),
    content: makeFunctionReference<'action', FunctionArgs<CA['commit']>, FunctionReturnType<CA['commit']>>('cloudEditorCmsActions:commit'),
};
export type StudioOperation = Infer<typeof studioOperation>;
export type JournalOperation = Infer<typeof journalOperation>;
type RequestScope = { actorId: Id<'users'>; expectedRevision: number; expectedGeneration: number };
export type CloudStudioRequest = RequestScope & (
    { kind: 'structure'; operation: StudioOperation } | { kind: 'journal'; operation: JournalOperation }
);
export type CloudStudioOnOperation = (request: CloudStudioRequest) => Promise<void>;
export function useCloudStudioCopy(): typeof en { return useLocale().startsWith('sv') ? sv : en; }

export {
    journalDraftKey, journalDraftEntries, listJournalDrafts, writeJournalDraft,
    clearJournalDraft, clearAcknowledgedJournalDraft, dismissJournalDraftEntry,
    type CloudJournalDraft,
} from '@/lib/cloud-editor/journal-drafts';
