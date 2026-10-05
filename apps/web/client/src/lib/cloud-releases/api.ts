import { makeFunctionReference } from 'convex/server';
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import type * as Releases from '@convex/cloudReleases';
import type * as Actions from '@convex/cloudReleaseActions';
import type * as Backups from '@convex/cloudBackups';
import type * as BackupActions from '@convex/cloudBackupActions';
import type * as ReviewAccess from '@convex/cloudReleaseReviewAccess';

type Api = ApiFromModules<{ releases: typeof Releases; actions: typeof Actions; backups: typeof Backups; backupActions: typeof BackupActions; reviewAccess: typeof ReviewAccess }>;
export const cloudReleaseApi = {
    backups: makeFunctionReference<'query', FunctionArgs<Api['backups']['list']>, FunctionReturnType<Api['backups']['list']>>('cloudBackups:list'),
    issueReview: makeFunctionReference<'mutation', FunctionArgs<Api['reviewAccess']['issue']>, FunctionReturnType<Api['reviewAccess']['issue']>>('cloudReleaseReviewAccess:issue'),
    exchangeReview: makeFunctionReference<'mutation', FunctionArgs<Api['reviewAccess']['exchange']>, FunctionReturnType<Api['reviewAccess']['exchange']>>('cloudReleaseReviewAccess:exchange'),
    authorizeReview: makeFunctionReference<'query', FunctionArgs<Api['reviewAccess']['authorize']>, FunctionReturnType<Api['reviewAccess']['authorize']>>('cloudReleaseReviewAccess:authorize'),
    status: makeFunctionReference<'query', FunctionArgs<Api['releases']['status']>, FunctionReturnType<Api['releases']['status']>>('cloudReleases:status'),
    capture: makeFunctionReference<'mutation', FunctionArgs<Api['releases']['capture']>, FunctionReturnType<Api['releases']['capture']>>('cloudReleases:capture'),
    prepare: makeFunctionReference<'action', FunctionArgs<Api['actions']['prepare']>, FunctionReturnType<Api['actions']['prepare']>>('cloudReleaseActions:prepare'),
    review: makeFunctionReference<'mutation', FunctionArgs<Api['releases']['review']>, FunctionReturnType<Api['releases']['review']>>('cloudReleases:review'),
    request: makeFunctionReference<'mutation', FunctionArgs<Api['releases']['request']>, FunctionReturnType<Api['releases']['request']>>('cloudReleases:request'),
    backupManifest: makeFunctionReference<'query', FunctionArgs<Api['backups']['manifest']>, FunctionReturnType<Api['backups']['manifest']>>('cloudBackups:manifest'),
    backupFile: makeFunctionReference<'action', FunctionArgs<Api['backupActions']['file']>, FunctionReturnType<Api['backupActions']['file']>>('cloudBackupActions:file'),
    restoreCopy: makeFunctionReference<'mutation', FunctionArgs<Api['backups']['restoreCopy']>, FunctionReturnType<Api['backups']['restoreCopy']>>('cloudBackups:restoreCopy'),
};
