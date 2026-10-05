import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import { makeFunctionReference } from 'convex/server';

import type * as Access from '@convex/cloudEditorAccess';
import type * as Content from '@convex/cloudEditorContent';
import type * as Actions from '@convex/cloudEditorContentActions';

type Api = ApiFromModules<{
    access: typeof Access;
    content: typeof Content;
    actions: typeof Actions;
}>;
type A = Api['access'];
type C = Api['content'];
type N = Api['actions'];

export const cloudContentApi = {
    assets: makeFunctionReference<
        'query',
        FunctionArgs<C['assets']>,
        FunctionReturnType<C['assets']>
    >('cloudEditorContent:assets'),
    previewAllowance: makeFunctionReference<
        'query',
        FunctionArgs<A['previewAllowance']>,
        FunctionReturnType<A['previewAllowance']>
    >('cloudEditorAccess:previewAllowance'),
    setPreviewAllowance: makeFunctionReference<
        'mutation',
        FunctionArgs<A['setPreviewAllowance']>,
        FunctionReturnType<A['setPreviewAllowance']>
    >('cloudEditorAccess:setPreviewAllowance'),
    approve: makeFunctionReference<
        'action',
        FunctionArgs<N['approve']>,
        FunctionReturnType<N['approve']>
    >('cloudEditorContentActions:approve'),
    revoke: makeFunctionReference<
        'mutation',
        FunctionArgs<C['revoke']>,
        FunctionReturnType<C['revoke']>
    >('cloudEditorContent:revoke'),
    listMembers: makeFunctionReference<
        'query',
        FunctionArgs<A['listMembers']>,
        FunctionReturnType<A['listMembers']>
    >('cloudEditorAccess:listMembers'),
    setMember: makeFunctionReference<
        'mutation',
        FunctionArgs<A['setMember']>,
        FunctionReturnType<A['setMember']>
    >('cloudEditorAccess:setMember'),
    removeMember: makeFunctionReference<
        'mutation',
        FunctionArgs<A['removeMember']>,
        FunctionReturnType<A['removeMember']>
    >('cloudEditorAccess:removeMember'),
};
export type CloudMember = FunctionReturnType<A['listMembers']>[number];
export type CloudMemberRole = CloudMember['role'];
